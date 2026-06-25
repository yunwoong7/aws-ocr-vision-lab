"""
Lambda for viewing and toggling SageMaker endpoint power state.

"Power" is modeled as the autoscaling MinCapacity of the endpoint variant:
  - ON  -> MinCapacity = 1 (one instance stays warm; requests served immediately)
  - OFF -> MinCapacity = 0 (scales in to zero when idle; no instance = no cost)

The target-tracking policy already scales 0<->N on backlog, so flipping the
floor between 0 and 1 is all we need. Turning ON registers MinCapacity=1 which
makes autoscaling spin an instance up; turning OFF lets it drain to zero.

Routes:
  GET  /endpoints              -> status of every known endpoint
  POST /endpoints/{family}     -> body {"enabled": bool}; sets Min/Max capacity
"""

import json
import os
import logging

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

# family -> endpoint name (provided by CDK). Families with no endpoint are skipped.
ENDPOINTS_BY_FAMILY = {
    "paddleocr": os.environ.get("PADDLE_ENDPOINT_NAME", ""),
    "unlimited-ocr": os.environ.get("UNLIMITED_ENDPOINT_NAME", ""),
}

# Max instances when ON (matches the CDK scalable-target max).
MAX_CAPACITY = int(os.environ.get("ENDPOINT_MAX_CAPACITY", "3"))

sagemaker = boto3.client("sagemaker", region_name=REGION)
autoscaling = boto3.client("application-autoscaling", region_name=REGION)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def _resource_id(endpoint_name: str) -> str:
    return f"endpoint/{endpoint_name}/variant/AllTraffic"


def _describe(family: str, endpoint_name: str) -> dict:
    """Return a status dict for one endpoint: power state + live counts."""
    state = {
        "family": family,
        "endpointName": endpoint_name,
        "enabled": False,  # MinCapacity >= 1
        "minCapacity": 0,
        "maxCapacity": MAX_CAPACITY,
        "currentInstanceCount": 0,
        "endpointStatus": "Unknown",
        # UI light: green (ready) / grey (off) / yellow (transitioning)
        "light": "grey",
    }

    # Autoscaling floor (MinCapacity) = power state.
    try:
        targets = autoscaling.describe_scalable_targets(
            ServiceNamespace="sagemaker",
            ResourceIds=[_resource_id(endpoint_name)],
        ).get("ScalableTargets", [])
        if targets:
            state["minCapacity"] = targets[0].get("MinCapacity", 0)
            state["maxCapacity"] = targets[0].get("MaxCapacity", MAX_CAPACITY)
            state["enabled"] = state["minCapacity"] >= 1
    except ClientError as e:
        logger.warning("describe_scalable_targets failed for %s: %s", endpoint_name, e)

    # Live endpoint status + instance count.
    try:
        ep = sagemaker.describe_endpoint(EndpointName=endpoint_name)
        state["endpointStatus"] = ep.get("EndpointStatus", "Unknown")
        variants = ep.get("ProductionVariants", [])
        if variants:
            state["currentInstanceCount"] = variants[0].get("CurrentInstanceCount", 0)
    except ClientError as e:
        logger.warning("describe_endpoint failed for %s: %s", endpoint_name, e)
        state["endpointStatus"] = "NotFound"

    # Derive the UI light.
    status = state["endpointStatus"]
    if status in ("Creating", "Updating", "SystemUpdating"):
        state["light"] = "yellow"
    elif state["currentInstanceCount"] >= 1 and status == "InService":
        state["light"] = "green"
    elif state["enabled"] and state["currentInstanceCount"] < 1:
        # Turned on but instance still spinning up.
        state["light"] = "yellow"
    else:
        state["light"] = "grey"

    return state


def _set_power(endpoint_name: str, enabled: bool) -> None:
    """Set MinCapacity to 1 (on) or 0 (off) via register_scalable_target."""
    autoscaling.register_scalable_target(
        ServiceNamespace="sagemaker",
        ResourceId=_resource_id(endpoint_name),
        ScalableDimension="sagemaker:variant:DesiredInstanceCount",
        MinCapacity=1 if enabled else 0,
        MaxCapacity=MAX_CAPACITY,
    )


def handler(event, context):
    try:
        # Auth (any signed-in user may toggle; endpoints are shared infra).
        claims = (
            event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        )
        if not claims.get("sub"):
            return _error(401, "Unauthorized")

        method = event.get("httpMethod", "GET")
        path_params = event.get("pathParameters") or {}
        family = path_params.get("family")

        if method == "GET":
            statuses = [
                _describe(fam, name)
                for fam, name in ENDPOINTS_BY_FAMILY.items()
                if name
            ]
            return _ok({"endpoints": statuses})

        if method == "POST":
            if not family or family not in ENDPOINTS_BY_FAMILY:
                return _error(400, f"Unknown family: {family}")
            endpoint_name = ENDPOINTS_BY_FAMILY.get(family)
            if not endpoint_name:
                return _error(404, f"No endpoint configured for family: {family}")

            body = json.loads(event.get("body") or "{}")
            enabled = bool(body.get("enabled", False))

            # RegisterScalableTarget only works while the endpoint is InService.
            # During Creating/Updating it's mid-transition — reject with a clear
            # message instead of a 500 so the UI can show "please wait".
            current = _describe(family, endpoint_name)
            if current["endpointStatus"] not in ("InService",):
                return _error(
                    409,
                    f"Endpoint is {current['endpointStatus']}; "
                    f"wait until it settles before toggling.",
                )

            _set_power(endpoint_name, enabled)
            logger.info(
                "Set %s (%s) power -> %s", family, endpoint_name, "ON" if enabled else "OFF"
            )
            # Return the fresh status so the UI can update immediately.
            return _ok({"endpoint": _describe(family, endpoint_name)})

        return _error(405, f"Method not allowed: {method}")

    except Exception as e:
        logger.exception("endpoint_manager error: %s", e)
        return _error(500, "Internal server error")


def _ok(payload: dict) -> dict:
    return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps(payload)}


def _error(status_code: int, message: str) -> dict:
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps({"error": message}),
    }

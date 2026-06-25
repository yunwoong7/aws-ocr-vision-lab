"""Build Trigger Lambda (async, two handlers)

Used by a CDK custom-resource Provider with isCompleteHandler so that long
CodeBuild runs (large model images) don't hit the 15-min Lambda limit:

- on_event:    start the CodeBuild build, return its build id immediately.
- is_complete: poll the build; report done only when it SUCCEEDED (else fail).

The Provider calls is_complete on an interval until it returns IsComplete=True
or the Provider's totalTimeout elapses. Neither handler sleeps/blocks, so each
invocation is short. (No cfnresponse — the Provider framework handles that.)
"""
import boto3

codebuild = boto3.client("codebuild")


def on_event(event, context):
    """Start the build (or no-op on delete). Returns the build id in Data."""
    request_type = event.get("RequestType")
    print(f"on_event RequestType: {request_type}")

    if request_type == "Delete":
        return {"PhysicalResourceId": event.get("PhysicalResourceId", "build-trigger")}

    project_name = event["ResourceProperties"]["ProjectName"]
    print(f"Starting build for project: {project_name}")
    response = codebuild.start_build(projectName=project_name)
    build_id = response["build"]["id"]
    print(f"Build started: {build_id}")

    # Stable PhysicalResourceId across the build lifecycle; build id in Data so
    # is_complete can read it.
    return {
        "PhysicalResourceId": f"build-{project_name}",
        "Data": {"BuildId": build_id},
    }


def is_complete(event, context):
    """Return IsComplete=True only once the build has SUCCEEDED."""
    request_type = event.get("RequestType")
    if request_type == "Delete":
        return {"IsComplete": True}

    build_id = (event.get("Data") or {}).get("BuildId")
    if not build_id:
        return {"IsComplete": True}

    builds = codebuild.batch_get_builds(ids=[build_id])
    status = builds["builds"][0]["buildStatus"]
    print(f"Build {build_id} status: {status}")

    if status == "SUCCEEDED":
        return {"IsComplete": True, "Data": {"BuildId": build_id, "Status": status}}
    if status in ("FAILED", "FAULT", "STOPPED", "TIMED_OUT"):
        raise Exception(f"CodeBuild {build_id} ended with status {status}")

    # Still IN_PROGRESS — Provider re-invokes after queryInterval.
    return {"IsComplete": False}

"""CloudFormation Custom Resource Response Module

This module provides helper functions for sending responses to CloudFormation
custom resources. It mimics the cfnresponse module that's automatically
included when using inline code (ZipFile) in Lambda definitions.
"""
import json
import urllib.request

SUCCESS = "SUCCESS"
FAILED = "FAILED"


def send(event, context, response_status, response_data, physical_resource_id=None, no_echo=False, reason=None):
    """Send a response to CloudFormation.

    Args:
        event: The CloudFormation custom resource event
        context: The Lambda context
        response_status: SUCCESS or FAILED
        response_data: Dict of response data to return
        physical_resource_id: Optional physical resource ID
        no_echo: If True, mask the output
        reason: Optional reason for the response
    """
    response_url = event['ResponseURL']

    response_body = {
        'Status': response_status,
        'Reason': reason or f'See CloudWatch Log Stream: {context.log_stream_name}',
        'PhysicalResourceId': physical_resource_id or context.log_stream_name,
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'NoEcho': no_echo,
        'Data': response_data
    }

    json_response_body = json.dumps(response_body)
    print(f"Response body: {json_response_body}")

    headers = {
        'content-type': '',
        'content-length': str(len(json_response_body))
    }

    try:
        req = urllib.request.Request(
            url=response_url,
            data=json_response_body.encode('utf-8'),
            headers=headers,
            method='PUT'
        )
        with urllib.request.urlopen(req) as response:
            print(f"Status code: {response.status}")
    except Exception as e:
        print(f"send(..) failed executing request: {e}")
        raise

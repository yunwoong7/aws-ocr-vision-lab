"""Build Trigger Lambda

Triggers CodeBuild project and waits for completion.
Used by CDK Custom Resource during deployment.
"""
import boto3
import time
import cfnresponse


def handler(event, context):
    """Handle Custom Resource events."""
    print(f"Event: {event}")

    if event['RequestType'] == 'Delete':
        cfnresponse.send(event, context, cfnresponse.SUCCESS, {})
        return

    project_name = event['ResourceProperties']['ProjectName']
    codebuild = boto3.client('codebuild')

    try:
        print(f"Starting build for project: {project_name}")
        response = codebuild.start_build(projectName=project_name)
        build_id = response['build']['id']
        print(f"Build started: {build_id}")

        while True:
            builds = codebuild.batch_get_builds(ids=[build_id])
            build = builds['builds'][0]
            status = build['buildStatus']
            print(f"Build status: {status}")

            if status == 'SUCCEEDED':
                cfnresponse.send(event, context, cfnresponse.SUCCESS, {
                    'BuildId': build_id,
                    'Status': status
                })
                return
            elif status in ['FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT']:
                cfnresponse.send(event, context, cfnresponse.FAILED, {
                    'BuildId': build_id,
                    'Status': status,
                    'Error': f'Build {status}'
                })
                return

            time.sleep(30)

    except Exception as e:
        print(f"Error: {str(e)}")
        cfnresponse.send(event, context, cfnresponse.FAILED, {
            'Error': str(e)
        })

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
import json
from aws_lambda_powertools import Logger
from policy_explorer.step_functions_lambda.scan_policy_all_services_router import lambda_handler
from moto import mock_sts, mock_dynamodb, mock_s3
from tests.test_policy_explorer.mock_data import event
from unittest.mock import patch

logger = Logger(level="info")
event['ServiceName'] = 's3'
context = {}


@mock_s3
@mock_dynamodb
@mock_sts
def test_lambda_function():
    # ACT
    response = lambda_handler(event, context)
    logger.info(response)

    # ASSERT
    assert response is None


def mock_write_task_failure(job_id: str, policy_type_key:str, account_id: str, region: str, service_name: str, message: str):
    assert job_id == "12345-45678-098765"
    assert policy_type_key == "POLICY_EXPLORER"
    assert account_id == "123456789012"
    assert region == None
    assert service_name == "no-service"
    assert message == "{\"error\": \"function scan_no-service_policy is not available in ScanPolicyStrategy\"}"

@mock_dynamodb
@mock_sts
@patch('policy_explorer.step_functions_lambda.scan_policy_all_services_router.SUPPORTED_SERVICES', [{
    "ServiceName": "no-service",
    "ServicePrincipal": "no-service.amazonaws.com",
    "FriendlyName": "Dummy"
}])
@patch('policy_explorer.step_functions_lambda.scan_policy_all_services_router.write_task_failure', mock_write_task_failure)
def test_service_with_no_scan_policy(): 
    
    event['ServiceName'] = 'no-service'
    #ACT
    response = lambda_handler(event, context)
    logger.info(type(response))
    
    assert response is None
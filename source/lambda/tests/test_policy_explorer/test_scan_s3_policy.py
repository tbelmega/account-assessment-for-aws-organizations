# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
import json

import pytest
from aws_lambda_powertools import Logger
from moto import mock_s3, mock_sts

from policy_explorer.step_functions_lambda.scan_s3_bucket_policy import S3BucketPolicy
from tests.test_policy_explorer.mock_data import mock_policies, event
from policy_explorer.policy_explorer_model import PolicyType

logger = Logger(level="info")


@mock_sts
@mock_s3
def test_s3_policy_scan_no_buckets():
    # ACT
    response = S3BucketPolicy(event).scan()
    logger.info(response)

    # ASSERT
    # ASSERT
    assert response == []


@pytest.fixture
def s3_setup(s3_client, s3_client_resource):
    # ARRANGE
    for policy_object in mock_policies:
        if policy_object.get('MockResourceName'):
            bucket = s3_client_resource.Bucket(policy_object.get('MockResourceName'))
            bucket.create()
            if policy_object.get('MockPolicy'):  # skip if no policy
                s3_client.put_bucket_policy(
                    Bucket=policy_object.get('MockResourceName'),
                    Policy=json.dumps(policy_object.get('MockPolicy')))
                logger.info(f"For S3 Bucket: {policy_object.get('MockResourceName')} "
                            f"put policy: {policy_object.get('MockPolicy')}")


@mock_sts
def test_s3_policy_scan(mocker, s3_setup):
    
    def return_region(self, bucket_name):
        return "us-east-1"
    
    mocker.patch(
        "aws.services.s3.S3.get_bucket_location",
        return_region
    )

    # ACT
    response = S3BucketPolicy(event).scan()
    #logger.info(response)

    # ASSERT
    assert len(list(response)) == 11
    
    logger.info(response[0])
    assert response[0]['Action'] == '"s3:PutObject"'
    assert response[0]['SortKey'] == 'us-east-1#s3#123456789012#resource_1#1'
    assert response[0]['ResourceIdentifier'] == 'resource_1'
    assert response[0]['PartitionKey'] == PolicyType.RESOURCE_BASED_POLICY.value
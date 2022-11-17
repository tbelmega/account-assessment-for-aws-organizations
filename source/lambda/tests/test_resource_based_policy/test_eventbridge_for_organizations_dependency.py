# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
import json

import boto3
from aws_lambda_powertools import Logger

from resource_based_policy.resource_based_policy_model import ResourceBasedPolicyResponseModel
from resource_based_policy.step_functions_lambda.scan_policy_all_services import EventBusPolicy
from moto import mock_sts, mock_events
from tests.test_resource_based_policy.mock_data import event

logger = Logger(loglevel="info")


@mock_sts
@mock_events
def test_no_event_bus():
    # ACT
    response = EventBusPolicy(event).scan()
    logger.info(response)

    # ASSERT
    assert len(list(response)) == 0


@mock_sts
@mock_events
def test_event_bus_no_policy():
    # ARRANGE
    for region in event['Regions']:
        events_client = boto3.client("events", region_name=region)
        events_client.create_event_bus(
            Name='EventBusNoPolicy'
        )

    # ACT
    response = EventBusPolicy(event).scan()
    logger.info(response)

    # ASSERT
    assert len(list(response)) == 0


@mock_sts
@mock_events
def test_event_bus_with_policy():
    # ARRANGE
    condition = {
        'Type': 'StringEquals',
        'Key': 'aws:PrincipalOrgID',
        'Value': 'o-a1b2c3d4e5'
    }
    for region in event['Regions']:
        events_client = boto3.client("events", region_name=region)
        events_client.create_event_bus(
            Name=f"EventBusNoPolicy-{region}"
        )
        events_client.put_permission(
                    Action='events:PutEvents',
                    Principal='*',
                    StatementId=f"StatementId-{region}",
                    Condition=condition,
                    EventBusName=f"EventBusNoPolicy-{region}"
                )

    # ACT
    response: list[ResourceBasedPolicyResponseModel] = EventBusPolicy(event).scan()
    logger.info(response)

    # ASSERT
    assert len(list(response)) == 2
    for resource in response:
        assert resource['DependencyType'] == condition.get('Key')
        assert resource['DependencyOn'] == condition.get('Value')

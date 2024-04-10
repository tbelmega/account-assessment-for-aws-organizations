# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
from os import getenv
from typing import Iterable

from aws_lambda_powertools import Logger
from mypy_boto3_s3.type_defs import BucketTypeDef, GetBucketPolicyOutputTypeDef

import policy_explorer.policy_explorer_model as model
from aws.services.s3 import S3
from policy_explorer.step_functions_lambda.split_arn_to_policy_details import get_policy_details_from_arn
from aws.utils.get_partition import partition_name_for_current_region
from policy_explorer.supported_configuration.supported_regions_and_services import SupportedRegions
from policy_explorer.step_functions_lambda.utils import DenormalizePolicyDetailsIntoDynamoDBItems

class S3BucketPolicy:
    def __init__(self, event: model.ScanServiceRequestModel):
        self.logger = Logger(service=self.__class__.__name__, level=getenv('LOG_LEVEL'))
        self.event = event
        self.s3_client = S3(event['AccountId'])
        self.account_id = event['AccountId']

    def scan(self) -> Iterable[model.DynamoDBPolicyItem]:
        bucket_names = self._get_bucket_names()
        bucket_data: list[model.S3Data] = self._get_s3_data(bucket_names)
        bucket_policy_details = self._get_bucket_policy_details(bucket_data)
        bucket_policy_details_for_account = []
        for resource in bucket_policy_details:
            bucket_policy_details_for_account.extend(DenormalizePolicyDetailsIntoDynamoDBItems(self.event).model(resource))
        return bucket_policy_details_for_account

    def _get_bucket_names(self) -> list[str]:
        bucket_objects: list[BucketTypeDef] = self.s3_client.list_buckets().get('Buckets', [])
        return [bucket.get('Name') for bucket in bucket_objects]

    def _get_s3_data(self, bucket_names) -> list[model.S3Data]:
        return list(self.denormalize_to_s3_data(bucket) for bucket in bucket_names)

    def denormalize_to_s3_data(self, bucket_name: str) -> model.S3Data:
        data: model.S3Data = {
            "BucketName": bucket_name,
            "BucketRegion": self.s3_client.get_bucket_location(bucket_name),
            "BucketAccountId": self.account_id
        }
        return data

    def _get_bucket_policy_details(self, s3_data: list[model.S3Data]) -> list[model.PolicyDetails]:
        bucket_policies = []
        for s3 in s3_data:
            s3_client = self._get_s3_client_with_regional_endpoint_if_opt_in_region(s3)
            policy: GetBucketPolicyOutputTypeDef = s3_client.get_bucket_policy(s3['BucketName'])
            if policy.get('Policy'):
                bucket_arn = f"arn:{partition_name_for_current_region()}:s3:::{s3['BucketName']}"
                policy_details: model.PolicyDetails = get_policy_details_from_arn(bucket_arn)
                policy_details.update({'Region': s3['BucketRegion']})
                policy_details.update({'AccountId': s3['BucketAccountId']})
                policy_details.update({'Policy': policy.get('Policy')})
                policy_details.update({'PolicyType': model.PolicyType.RESOURCE_BASED_POLICY})
                bucket_policies.append(policy_details)
        return bucket_policies

    def _get_s3_client_with_regional_endpoint_if_opt_in_region(self, s3):
        supported_regions = SupportedRegions().get_supported_region_objects()
        for supported in supported_regions:
            if s3['BucketRegion'] == supported['Region'] and "Opt-In" in supported['RegionName']:
                return S3(self.account_id, s3['BucketRegion'])
        return self.s3_client

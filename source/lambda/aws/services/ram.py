# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0


from os import getenv
from botocore.exceptions import ClientError

from aws_lambda_powertools import Logger
from aws.utils.exceptions import service_exception_handler, resource_not_found_exception_handler
from mypy_boto3_ram.type_defs import ResourceTypeDef, GetResourcePoliciesResponseTypeDef
from aws.services.security_token_service import SecurityTokenService
from aws.utils.boto3_session import Boto3Session

class RAM:
    def __init__(self, account_id, region):
        self.logger = Logger(service=self.__class__.__name__, level=getenv('LOG_LEVEL'))
        self.region = region
        role_name = getenv('SPOKE_ROLE_NAME')
        self.logger.debug(f"Assuming role {role_name} in {account_id} to scan service: {self.__class__.__name__}")
        account_credentials = SecurityTokenService().assume_role_by_name(account_id, role_name)
        boto_session = Boto3Session('ram', credentials=account_credentials, region=region)
        self.ram_client = boto_session.get_client()
    
    @service_exception_handler
    def list_resources(self) -> list[ResourceTypeDef]:
        response: ResourceTypeDef = self.ram_client.list_resources(
                resourceOwner='SELF'
            )

        resource_summary_list = response.get('resources', [])
        next_token = response.get('nextToken', None)

        while next_token is not None:
            self.logger.debug(f"Next Token Returned: {next_token}")
            response = self.ram_client.list_resources(
                resourceOwner='SELF',
                nextToken=next_token
            )
            self.logger.info(f"Extending resource summary list")
            resource_summary_list.extend(response.get('resources', []))
            next_token = response.get('nextToken', None)
        return resource_summary_list

    @resource_not_found_exception_handler
    def get_resource_policy(self, resource_arn: str) -> str | None:
        response: GetResourcePoliciesResponseTypeDef = self.ram_client.get_resource_policies(
            resourceArns=[resource_arn]
        )
        self.logger.debug(f"Resource Policy for {resource_arn}: {response}")
        policies = response.get('policies')
        if len(policies) > 0:
            return policies[0]
        return None
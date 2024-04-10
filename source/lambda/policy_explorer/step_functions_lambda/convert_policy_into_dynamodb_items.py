# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import json
from utils.base_repository import Clock
from typing import List
from os import getenv
from aws_lambda_powertools import Logger
from policy_explorer.policy_explorer_model import ParameterValidation, \
    PolicyDetails, DynamoDBPolicyItem, KeyTypeToBeJSONFormatted, ValidateParameters
    
class ConvertPolicyIntoDynamoDBItems:
    
    def __init__(self):
        self.logger = Logger(service=self.__class__.__name__, level=getenv('LOG_LEVEL'))
        self.dynamodb_formatted_items = []
        self.clock = Clock()

    def get_seconds_to_live(self):
        days_to_live = int(getenv('TIME_TO_LIVE_IN_DAYS') or 2)
        return days_to_live * 24 * 60 * 60

    def _calculate_expires_at(self):
        return self.clock.current_time_in_ms() + self.get_seconds_to_live()
        
    
    def policy_details_validation(self, policy_details: PolicyDetails) -> bool | List[ParameterValidation]:
        validations = []
        for parameter in ValidateParameters:
            policy_details_key = parameter.value
            if policy_details.get(policy_details_key) is None:
                validations.append(ParameterValidation(Key=policy_details_key, Value=policy_details.get(policy_details_key), Message=f"{policy_details_key} is required"))
        return validations 
    
    def create_sort_key(self, policy_details: PolicyDetails, statement_count: int) -> str:
        return f"{policy_details.get('Region')}#{policy_details.get('Service')}#{policy_details.get('AccountId')}#{policy_details.get('ResourceIdentifier')}#{statement_count}"
        
    def create_items(self, policy_details: PolicyDetails) -> List[DynamoDBPolicyItem]:
        
            validations = self.policy_details_validation(policy_details)
            if validations != []:
                self.logger.warning(f"validation errors for items, {validations} in policy detail object {policy_details}")
                return []
            
            
            if isinstance(policy_details.get('Policy'), str):
                policy_as_dictionary = json.loads(policy_details.get('Policy'))
            if isinstance(policy_details.get('Policy'), dict):
                policy_as_dictionary = policy_details.get('Policy')
                
            statements_in_policy = policy_as_dictionary.get('Statement', [])
            statement_count = 1
            for statement in statements_in_policy:
                ddb_item: DynamoDBPolicyItem = {
                    'PartitionKey': policy_details.get('PolicyType').value,
                    'SortKey': f"{self.create_sort_key(policy_details=policy_details, statement_count=statement_count)}",
                    'Region': policy_details.get('Region'),
                    'AccountId': policy_details.get('AccountId'),
                    'Effect': statement.get('Effect'),
                    'Service': policy_details.get('Service'),
                    'ResourceIdentifier': policy_details.get('ResourceIdentifier'),
                    'Policy': json.dumps(policy_as_dictionary),
                    'ExpiresAt': self._calculate_expires_at()
                }
                if statement.get('Sid'):
                    ddb_item.update({'Sid': statement.get('Sid')})
                    
                for key in KeyTypeToBeJSONFormatted:
                    if statement.get(key.value):
                        ddb_item.update({key.value: json.dumps(statement.get(key.value))})
                
                self.dynamodb_formatted_items.append(ddb_item)
                statement_count += 1
            self.logger.debug(f"Formatted DynamoDB Items: {self.dynamodb_formatted_items} for Policy Details {policy_details}")
            return self.dynamodb_formatted_items
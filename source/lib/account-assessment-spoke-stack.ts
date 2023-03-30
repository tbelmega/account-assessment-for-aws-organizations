// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {CfnParameter, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {ArnPrincipal, CompositePrincipal, Effect, Policy, PolicyStatement, Role} from "aws-cdk-lib/aws-iam";
import {addCfnSuppressRules} from "@aws-solutions-constructs/core";
import {
    SCAN_SPOKE_RESOURCES_ROLE_NAME,
    SPOKE_EXECUTION_ROLE_NAME,
    VALIDATION_ACCOUNT_ACCESS_ROLE_NAME
} from "./components/resource-based-policy-component";

export class SpokeStack extends Stack {
    public readonly hubAccountId: string;

    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const hubAccountIdParameter = new CfnParameter(this, 'HubAccountId', {
            description: 'ID of the AWS account where the Hub Stack of this solution is deployed.',
            type: 'String'
        });
        this.hubAccountId = hubAccountIdParameter.valueAsString;

        const namespace = new CfnParameter(this, 'DeploymentNamespace', {
            description: 'Will be used as prefix for resource names. Same namespace must be used in hub stack.',
            maxLength: 10,
            type: 'String'
        });

        this.templateOptions.metadata = {
            "AWS::CloudFormation::Interface": {
                ParameterGroups: [
                    {
                        Label: {default: "Solution Setup"},
                        Parameters: [namespace.logicalId, hubAccountIdParameter.logicalId]
                    }
                ],
                ParameterLabels: {
                    [namespace.logicalId]: {
                        default: "Provide the unique namespace value",
                    },
                    [hubAccountIdParameter.logicalId]: {
                        default: "Provide the Hub Account Id",
                    }
                },
            },
        };


        const scanSpokePolicy = new Policy(this, 'ScanSpokePolicy', {
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: [
                        "s3:GetBucketPolicy",
                        "s3:ListAllMyBuckets",
                        "s3:GetBucketLocation",
                        "glacier:GetVaultAccessPolicy",
                        "glacier:ListVaults",
                        "sns:ListTopics", "sqs:ListQueues",
                        "iam:ListRoles",
                        "iam:ListPolicies",
                        "lambda:ListFunctions",
                        "elasticfilesystem:DescribeFileSystemPolicy",
                        "elasticfilesystem:DescribeFileSystems",
                        "secretsmanager:ListSecrets",
                        "iot:ListPolicies",
                        "kms:ListKeys",
                        "kms:GetKeyPolicy",
                        "events:ListEventBuses",
                        "ses:ListEmailIdentities",
                        "apigateway:GET",
                        "config:DescribeOrganizationConfigRules",
                        "ssm-incidents:ListResponsePlans",
                        "es:ListDomainNames",
                        "cloudformation:ListStacks",
                        "serverlessrepo:ListApplications",
                        "backup:ListBackupVaults",
                        "codeartifact:ListRepositories",
                        "codeartifact:ListDomains",
                        "codebuild:ListReportGroups",
                        "codebuild:ListProjects",
                        "mediastore:ListContainers",
                        "ec2:DescribeVpcEndpoints"
                    ],
                    resources: ["*"]
                }),
                new PolicyStatement({
                    actions: [
                        "sns:GetTopicAttributes"
                    ],
                    resources: [`arn:aws:sns:*:${this.account}:*`],
                }),

                new PolicyStatement({
                    actions: [
                        "sqs:GetQueueAttributes",
                    ],
                    resources: [`arn:aws:sqs:*:${this.account}:*`],
                }),

                new PolicyStatement({
                    actions: [
                        "iam:GetPolicyVersion"
                    ],
                    resources: [`arn:aws:iam::${this.account}:policy/*`],
                }),

                new PolicyStatement({
                    actions: [
                        "lambda:GetPolicy"
                    ],
                    resources: [`arn:aws:lambda:*:${this.account}:function:*`],
                }),

                new PolicyStatement({
                    actions: [
                        "secretsmanager:GetResourcePolicy",
                    ],
                    resources: [`arn:aws:secretsmanager:*:${this.account}:secret:*`],
                }),

                new PolicyStatement({
                    actions: [
                        "iot:GetPolicy",
                    ],
                    resources: [`arn:aws:iot:*:${this.account}:policy/*`],
                }),
                new PolicyStatement({
                    actions: [
                        "ses:GetEmailIdentityPolicies"
                    ],
                    resources: [`arn:aws:ses:*:${this.account}:identity/*`],
                }),
                new PolicyStatement({
                    actions: [
                        "ecr:DescribeRepositories",
                        "ecr:GetRepositoryPolicy"
                    ],
                    resources: [`arn:aws:ecr:*:${this.account}:repository/*`],
                }),

                new PolicyStatement({
                    actions: [
                        "ssm-incidents:GetResourcePolicies"
                    ],
                    resources: [`arn:aws:ssm-incidents::${this.account}:response-plan/*`],
                }),

                new PolicyStatement({
                    actions: [
                        "es:DescribeDomains"
                    ],
                    resources: [`arn:aws:es:*:${this.account}:domain/*`],
                }),

                new PolicyStatement({
                    actions: [
                        "cloudformation:GetStackPolicy"
                    ],
                    resources: [`arn:aws:cloudformation:*:${this.account}:stack/*/*`],
                }),
                new PolicyStatement({
                    actions: [
                        "glue:GetResourcePolicies"
                    ],
                    resources: [`arn:aws:glue:*:${this.account}:catalog`],
                }),
                new PolicyStatement({
                    actions: [
                        "serverlessrepo:GetApplicationPolicy"
                    ],
                    resources: [`arn:aws:serverlessrepo:*:${this.account}:applications/*`],
                }),
                new PolicyStatement({
                    actions: [
                        "backup:GetBackupVaultAccessPolicy"
                    ],
                    resources: [`arn:aws:backup:*:${this.account}:backup-vault:*`],
                }),
                new PolicyStatement({
                    actions: [
                        "codeartifact:GetRepositoryPermissionsPolicy",
                        "codeartifact:GetDomainPermissionsPolicy"
                    ],
                    resources: [
                        `arn:aws:codeartifact:*:${this.account}:domain/*`,
                        `arn:aws:codeartifact:*:${this.account}:repository/*/*`
                    ],
                }),
                new PolicyStatement({
                    actions: [
                        "codebuild:BatchGetProjects",
                        "codebuild:GetResourcePolicy"
                    ],
                    resources: [
                        `arn:aws:codebuild:*:${this.account}:project/*`,
                        `arn:aws:codebuild:*:${this.account}:report-group/*`
                    ],
                }),
                new PolicyStatement({
                    actions: [
                        "mediastore:GetContainerPolicy"
                    ],
                    resources: [`arn:aws:mediastore:*:${this.account}:container/*`],
                }),
            ]
        });

        const role = new Role(this, 'SpokeStackRole', {
            roleName: `${namespace.valueAsString}-${this.region}-${SPOKE_EXECUTION_ROLE_NAME}`,
            assumedBy: new CompositePrincipal(
              new ArnPrincipal(`arn:aws:iam::${this.hubAccountId}:role/${namespace.valueAsString}-${this.region}-${VALIDATION_ACCOUNT_ACCESS_ROLE_NAME}`),
              new ArnPrincipal(`arn:aws:iam::${this.hubAccountId}:role/${namespace.valueAsString}-${this.region}-${SCAN_SPOKE_RESOURCES_ROLE_NAME}`)
            )
        });
        role.attachInlinePolicy(scanSpokePolicy);


        addCfnSuppressRules(scanSpokePolicy, [{
            id: 'W12',
            reason: 'Resource * is necessary to allow scanning all resources using the listed operations.'
        }]);


        addCfnSuppressRules(role, [{
            id: 'W11',
            reason: 'Resource * is necessary to allow scanning all resources using the listed operations.'
        }, {
            id: 'W28',
            reason: 'This role needs an explicit name so that the Hub Stack can reference the role in all Spoke Stacks.'
        }]);
    }
}
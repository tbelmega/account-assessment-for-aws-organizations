// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {AttributeType, BillingMode, Table, TableEncryption,} from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import {CfnPolicy, CfnRole, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {Construct} from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-events";
import {EventbridgeToLambda, EventbridgeToLambdaProps} from "@aws-solutions-constructs/aws-eventbridge-lambda";
import {CfnParameter, Duration} from "aws-cdk-lib";
import {
  AuthorizationType,
  AwsIntegration,
  IntegrationResponse,
  JsonSchema,
  JsonSchemaType,
  LambdaIntegration,
  MethodResponse,
  Model,
  PassthroughBehavior,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import {CognitoAuthenticationResources} from "./cognito-authenticator";
import {StateMachine} from "aws-cdk-lib/aws-stepfunctions";
import {addCfnSuppressRules} from "@aws-solutions-constructs/core";
import {createStateMachine} from "./policy-explorer-state-machine";

export const SPOKE_EXECUTION_ROLE_NAME = "AccountAssessment-Spoke-ExecutionRole";
export const VALIDATION_ACCOUNT_ACCESS_ROLE_NAME = 'ValidateSpokeAccountAccess'
export const POLICY_SCAN_SPOKE_RESOURCES_ROLE_NAME = 'PolicyExplorerScanSpokeResource'
export const ORG_MANAGEMENT_ROLE_NAME = 'AccountAssessment-OrgMgmtStackRole';

export interface PolicyExplorerScanComponentProps {
  api: RestApi;
  apiResourcePath: string;
  componentTableConfig: {
    partitonKeyName: string;
    sortKeyName: string;
  };
  assetCode: lambda.AssetCode;
  tables: {
    jobHistory: Table,
  },
  functions: {
    deleteJob: lambda.Function,
  }
  componentConfig: {
    readHandlerPath: string,
    apiResourcePath: string,
    tableEnvVariableName: string,
    powertoolsServiceName: string
    dynamoTtlInDays: CfnParameter,
    solutionVersion: string,
    stackId: string,
    sendAnonymousData: string
  }
  roleAssumedByApiGateway: iam.ServicePrincipal;
  dynamoDbRoleName: string;
  cognitoAuthenticationResources: CognitoAuthenticationResources;
  namespace: CfnParameter;
  region: string,
  partition: string,
  accountId: string,
}

export class PolicyExplorerScanComponent extends Construct {
  
  public readonly componentTable: Table;
  public readonly stateMachine: StateMachine;

  constructor(
    scope: Construct,
    id: string,
    props: PolicyExplorerScanComponentProps
  ) {
    super(scope, id);


    const componentSubDirectoryInLambdaCode = 'policy_explorer';
    
    this.componentTable = new Table(this, "Table", {
      partitionKey: {
        name: props.componentTableConfig.partitonKeyName,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: props.componentTableConfig.sortKeyName,
        type: AttributeType.STRING,
      },
      encryption: TableEncryption.AWS_MANAGED,
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ExpiresAt",
    });

    const dynamoDbRole = new iam.Role(this, props.dynamoDbRoleName, {
      assumedBy: props.roleAssumedByApiGateway,
    });

    const dynamoDbPolicyStatement = new PolicyStatement();
    dynamoDbPolicyStatement.addActions("dynamodb:Query");
    dynamoDbPolicyStatement.addResources(this.componentTable.tableArn);

    dynamoDbRole.addToPolicy(dynamoDbPolicyStatement);

    // has to match AssessmentType. referenced via DynamoDB(os.getenv(assessment_type))
    props.functions.deleteJob.addEnvironment(props.componentConfig.tableEnvVariableName, this.componentTable.tableName);
    this.componentTable.grantReadWriteData(props.functions.deleteJob);
    this.componentTable.addGlobalSecondaryIndex({
      indexName: 'JobId',
      partitionKey: {name: 'JobId', type: AttributeType.STRING},
    });

    const validateAccountAccessFunction = new lambda.Function(this, 'ValidateSpokeAccountAccess', {
      runtime: lambda.Runtime.PYTHON_3_12,
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.minutes(15),
      memorySize: 1024,
      code: props.assetCode,
      handler: `${componentSubDirectoryInLambdaCode}/step_functions_lambda/validate_account_access.lambda_handler`,
      environment: {
        COMPONENT_TABLE: this.componentTable.tableName,
        TABLE_JOBS: props.tables.jobHistory.tableName,
        TIME_TO_LIVE_IN_DAYS: props.componentConfig.dynamoTtlInDays.valueAsString,
        SPOKE_ROLE_NAME: `${props.namespace.valueAsString}-${props.region}-${SPOKE_EXECUTION_ROLE_NAME}`,
        LOG_LEVEL: 'INFO',
        POWERTOOLS_SERVICE_NAME: 'Scan' + props.componentConfig.powertoolsServiceName,
        SOLUTION_VERSION: props.componentConfig.solutionVersion,
        STACK_ID: props.componentConfig.stackId,
        SEND_ANONYMOUS_DATA: props.componentConfig.sendAnonymousData
      }
    });
  
    props.tables.jobHistory.grantReadWriteData(validateAccountAccessFunction);

    const scanFunction = new lambda.Function(this, 'StartScan', {
      runtime: lambda.Runtime.PYTHON_3_12,
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.minutes(2),
      code: props.assetCode,
      handler: 'policy_explorer/start_state_machine_execution_to_scan_services.lambda_handler',
      environment: {
        COMPONENT_TABLE: this.componentTable.tableName,
        TABLE_JOBS: props.tables.jobHistory.tableName,
        TIME_TO_LIVE_IN_DAYS: props.componentConfig.dynamoTtlInDays.valueAsString,
        ORG_MANAGEMENT_ROLE_NAME: `${props.namespace.valueAsString}-${props.region}-${ORG_MANAGEMENT_ROLE_NAME}`,
        LOG_LEVEL: 'INFO',
        POWERTOOLS_SERVICE_NAME: 'Scan' + props.componentConfig.powertoolsServiceName,
        SOLUTION_VERSION: props.componentConfig.solutionVersion,
        STACK_ID: props.componentConfig.stackId,
        SEND_ANONYMOUS_DATA: props.componentConfig.sendAnonymousData
      }
    });

    const policyExplorerScanSpokeResourceFunction = new lambda.Function(this, 'PolicyExplorerScanSpokeResource', {
      runtime: lambda.Runtime.PYTHON_3_12,
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.minutes(15),
      memorySize: 512,
      code: props.assetCode,
      handler: `${componentSubDirectoryInLambdaCode}/step_functions_lambda/scan_policy_all_services_router.lambda_handler`,
      environment: {
        COMPONENT_TABLE: this.componentTable.tableName,
        TABLE_JOBS: props.tables.jobHistory.tableName,
        TIME_TO_LIVE_IN_DAYS: props.componentConfig.dynamoTtlInDays.valueAsString,
        SPOKE_ROLE_NAME: `${props.namespace.valueAsString}-${props.region}-${SPOKE_EXECUTION_ROLE_NAME}`,
        ORG_MANAGEMENT_ROLE_NAME: `${props.namespace.valueAsString}-${props.region}-${ORG_MANAGEMENT_ROLE_NAME}`,
        LOG_LEVEL: 'INFO',
        POWERTOOLS_SERVICE_NAME: 'ScanResourceBasedPolicyInSpokeAccount',
        SOLUTION_VERSION: props.componentConfig.solutionVersion,
        STACK_ID: props.componentConfig.stackId,
        SEND_ANONYMOUS_DATA: props.componentConfig.sendAnonymousData
      }
    });

    const policyExplorerScanSpokeResourceRoleCfnRef = policyExplorerScanSpokeResourceFunction.role?.node.defaultChild as CfnRole
    policyExplorerScanSpokeResourceRoleCfnRef.roleName = `${props.namespace.valueAsString}-${props.region}-${POLICY_SCAN_SPOKE_RESOURCES_ROLE_NAME}`

    policyExplorerScanSpokeResourceFunction.addToRolePolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: ["arn:aws:iam::*:role/" + `${props.namespace.valueAsString}-${props.region}-${SPOKE_EXECUTION_ROLE_NAME}`],
    }));
    this.componentTable.grantReadWriteData(policyExplorerScanSpokeResourceFunction);
    props.tables.jobHistory.grantReadWriteData(policyExplorerScanSpokeResourceFunction);

    const finishScan = new lambda.Function(this, 'FinishAsyncJob', {
      runtime: lambda.Runtime.PYTHON_3_12,
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.minutes(1),
      code: props.assetCode,
      handler: `${componentSubDirectoryInLambdaCode}/finish_scan.lambda_handler`,
      environment: {
        COMPONENT_TABLE: this.componentTable.tableName,
        TABLE_JOBS: props.tables.jobHistory.tableName,
        TIME_TO_LIVE_IN_DAYS: props.componentConfig.dynamoTtlInDays.valueAsString,
        POWERTOOLS_SERVICE_NAME: 'FinishScanForResourceBasedPolicies',
        SOLUTION_VERSION: props.componentConfig.solutionVersion,
        STACK_ID: props.componentConfig.stackId,
        SEND_ANONYMOUS_DATA: props.componentConfig.sendAnonymousData
      }
    });
    props.tables.jobHistory.grantReadWriteData(finishScan);
    this.componentTable.grantReadWriteData(finishScan);

    const stateMachineName = `${props.namespace.valueAsString}-PolicyExplorerScan-StateMachine`
    this.stateMachine = createStateMachine(this, stateMachineName, validateAccountAccessFunction, policyExplorerScanSpokeResourceFunction, finishScan);

    //This statement is required for the Default Policy generated by Step function CDK to get the policy to start execution on itself, if this is not set the DISTRIBUTED execution mode will not work.
    const stateMachineDefaultPolicy = this.stateMachine.role.node.findChild("DefaultPolicy").node.findChild("Resource") as CfnPolicy
    stateMachineDefaultPolicy.addOverride("Properties.PolicyDocument.Statement.4", 
      {
        "Action": "states:StartExecution",
              "Effect": "Allow",
              "Resource": [
                `arn:${props.partition}:states:${props.region}:${props.accountId}:stateMachine:${stateMachineName}`
              ]
      })

    scanFunction.addEnvironment('SCAN_POLICIES_STATE_MACHINE_ARN', this.stateMachine.stateMachineArn);
    scanFunction.addToRolePolicy(new PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [this.stateMachine.stateMachineArn],
    }));

    const startScanFunctionRole_cfn_ref = scanFunction.role?.node.defaultChild as CfnRole
    startScanFunctionRole_cfn_ref.roleName = `${props.namespace.valueAsString}-${props.region}-${props.componentConfig.powertoolsServiceName}`

    const validateAccountAccessRole_cfn_ref = validateAccountAccessFunction.role?.node.defaultChild as CfnRole
    validateAccountAccessRole_cfn_ref.roleName = `${props.namespace.valueAsString}-${props.region}-${VALIDATION_ACCOUNT_ACCESS_ROLE_NAME}`

    validateAccountAccessFunction.addToRolePolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::*:role/${props.namespace.valueAsString}-${props.region}-${SPOKE_EXECUTION_ROLE_NAME}`],
    }))

    scanFunction.addToRolePolicy(new PolicyStatement({
      actions: ['organizations:DescribeOrganization'],
      resources: ["*"],
    }));
    scanFunction.addToRolePolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::*:role/${props.namespace.valueAsString}-${props.region}-${ORG_MANAGEMENT_ROLE_NAME}`],
    })); 

    policyExplorerScanSpokeResourceFunction.addToRolePolicy(new PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:aws:iam::*:role/${props.namespace.valueAsString}-${props.region}-${ORG_MANAGEMENT_ROLE_NAME}`],
    })); 


    const scanFunctionDefaultPolicy = scanFunction.node.tryFindChild('ServiceRole')
      ?.node.findChild('DefaultPolicy')
      .node.findChild('Resource') as CfnPolicy;
    scanFunctionDefaultPolicy && addCfnSuppressRules(scanFunctionDefaultPolicy, [{
      id: 'W12',
      reason: 'Resource * is necessary for organizations:List* operations. No risk, because the role can still only access its own organization.'
    }]);


    this.componentTable.grantReadWriteData(scanFunction);
    props.tables.jobHistory.grantReadWriteData(scanFunction);

    const eventbridgeToLambdaProps: EventbridgeToLambdaProps = {
      existingLambdaObj: scanFunction,
      eventRuleProps: {
        enabled: true,
        schedule: events.Schedule.cron({minute: "00", hour: "23",})
      }
    };

    new EventbridgeToLambda(this, 'policy-explorer-schedule-rule', eventbridgeToLambdaProps);

    const schema: JsonSchema = {
      type: JsonSchemaType.OBJECT,
      properties: {
        message: {
          type: JsonSchemaType.STRING,
        },
      },
    };

    const methodResponse200: MethodResponse = {
      statusCode: "200",
      responseParameters: {
        "method.response.header.Access-Control-Allow-Headers": true,
        "method.response.header.Access-Control-Allow-Origin": true
      },
      responseModels: {
        "application/json": new Model(this, "ResponseModel", {
          restApi: props.api,
          contentType: "application/json",
          schema: schema,
        }),
      },
    };

    const methodResponse404: MethodResponse = {
      statusCode: "404",
      responseModels: {
        "application/json": new Model(this, "ResponseModel404", {
          restApi: props.api,
          contentType: "application/json",
          schema: schema,
        }),
      },
    };

    const integrationResponse: IntegrationResponse = {
      statusCode: "200",
      responseParameters: {
        "method.response.header.Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        "method.response.header.Access-Control-Allow-Origin": "'*'"
      },
      responseTemplates: {
        "application/json": `#set($inputRoot = $input.path('$'))
                #if(!$inputRoot.containsKey("Items"))
                    #set($context.responseOverride.status = 404)
                    {"message": "Not Items matched for search criteria."}
                #else
                    $input.json('$')
                #end`,
      },
    };

    const getDynamoIntegration = new AwsIntegration({
      service: "dynamodb",
      action: "Query",
      options: {
        credentialsRole: dynamoDbRole,
        integrationResponses: [integrationResponse],
        requestTemplates: {
          "application/json": `#set($allParams = $input.params())
          #set($filters_list = ['action', 'condition', 'resource', 'principal', 'notAction', 'effect'])
          #set($filters_map = {'action':'Action','condition':'Condition', 'resource': 'Resource', 'principal':'Principal', 'notAction':'NotAction', 'effect': 'Effect'})
          #set($contains_string = 'contains')
          #set($filters_provided = [])
          #foreach($filter_key in $filters_list)
              #if($input.params($filter_key) != "")
                  #if($filters_provided.add($filter_key))#end
              #end
          #end
          {
              "TableName": "${this.componentTable.tableName}",
              "KeyConditionExpression": "#kn0 = :kv0 AND begins_with(#kn1, :kv1)",
              "ExpressionAttributeValues": {
                  ":kv0": {
                      "S": "$input.params('partitionKey')"
                  },
                  ":kv1": {
                      "S": "$input.params('region')"
                  }#foreach($filterKey in $filters_provided)#if($foreach.count<1)}#end#if($foreach.first),#end":$filterKey": {"S": "$util.urlDecode($input.params($filterKey))"#if($foreach.hasNext)},#else}#end#end},
              #foreach($filterKey in $filters_provided)
                  #if($foreach.first)"FilterExpression":"#end$contains_string(#$filterKey, :$filterKey)#if($foreach.hasNext) and#end#if($foreach.last)",#end#end
              "ExpressionAttributeNames": {
                  "#kn0": "PartitionKey",
                  "#kn1": "SortKey"#foreach($filterKey in $filters_provided)#if($foreach.first),#end"#$filterKey": "$filters_map.get($filterKey)"#if($foreach.hasNext),#end#end},
              "Limit": #if($input.params("limit") != "")$input.params("limit")#{else} 25#end
              #if($input.params("exclusivestartkey") != ""),"ExclusiveStartKey": $util.urlDecode($input.params("exclusivestartkey"))#end
          }`,
        },
        passthroughBehavior: PassthroughBehavior.NEVER,
      },
    });

    const readPolicyResources = props.api.root.addResource(`${props.apiResourcePath}`);
    const readResourcePolicy = readPolicyResources.addResource(`{partitionKey}`)

    const readFunction = new lambda.Function(this, 'Read', {
      runtime: Runtime.PYTHON_3_12,
      tracing: lambda.Tracing.ACTIVE,
      timeout: Duration.minutes(1),
      code: props.assetCode,
      handler: props.componentConfig.readHandlerPath,
      environment: {
        COMPONENT_TABLE: this.componentTable.tableName,
        TABLE_JOBS: props.tables.jobHistory.tableName,
        POWERTOOLS_SERVICE_NAME: 'Read' + props.componentConfig.powertoolsServiceName,
        SOLUTION_VERSION: props.componentConfig.solutionVersion,
        STACK_ID: props.componentConfig.stackId,
        SEND_ANONYMOUS_DATA: props.componentConfig.sendAnonymousData
      }
    });
    this.componentTable.grantReadData(readFunction);

    readResourcePolicy.addMethod('GET', new LambdaIntegration(readFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: props.cognitoAuthenticationResources.authorizerFullAccess.ref
      },
    });
    readResourcePolicy.addResource('ddb').addMethod("GET", getDynamoIntegration, {
      methodResponses: [methodResponse200, methodResponse404],
      apiKeyRequired: false,
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: props.cognitoAuthenticationResources.authorizerFullAccess.ref
      },
      requestParameters: {
        "method.request.querystring.action": false,
        "method.request.querystring.condition": false,
        "method.request.querystring.principal": false,
        "method.request.querystring.exclusivestartkey": false,
        "method.request.querystring.limit": false,
        "method.request.querystring.region": false,
        "method.request.querystring.resource": false
      }
    });
  }
}

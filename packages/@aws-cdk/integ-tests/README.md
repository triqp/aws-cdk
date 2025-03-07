# integ-tests

<!--BEGIN STABILITY BANNER-->

---

![cdk-constructs: Experimental](https://img.shields.io/badge/cdk--constructs-experimental-important.svg?style=for-the-badge)

> The APIs of higher level constructs in this module are experimental and under active development.
> They are subject to non-backward compatible changes or removal in any future version. These are
> not subject to the [Semantic Versioning](https://semver.org/) model and breaking changes will be
> announced in the release notes. This means that while you may use them, you may need to update
> your source code when upgrading to a newer version of this package.

---

<!--END STABILITY BANNER-->

## Overview

This library is meant to be used in combination with the [integ-runner]() CLI
to enable users to write and execute integration tests for AWS CDK Constructs.

An integration test should be defined as a CDK application, and
there should be a 1:1 relationship between an integration test and a CDK application.

So for example, in order to create an integration test called `my-function`
we would need to create a file to contain our integration test application.

*test/integ.my-function.ts*

```ts
const app = new App();
const stack = new Stack();
new lambda.Function(stack, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_12_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-handler')),
});
```

This is a self contained CDK application which we could deploy by running

```bash
cdk deploy --app 'node test/integ.my-function.js'
```

In order to turn this into an integration test, all that is needed is to
use the `IntegTest` construct.

```ts
declare const app: App;
declare const stack: Stack;
new IntegTest(app, 'Integ', { testCases: [stack] });
```

You will notice that the `stack` is registered to the `IntegTest` as a test case.
Each integration test can contain multiple test cases, which are just instances
of a stack. See the [Usage](#usage) section for more details.

## Usage

### IntegTest

Suppose you have a simple stack, that only encapsulates a Lambda function with a
certain handler:

```ts
interface StackUnderTestProps extends StackProps {
  architecture?: lambda.Architecture;
}

class StackUnderTest extends Stack {
  constructor(scope: Construct, id: string, props: StackUnderTestProps) {
    super(scope, id, props);
	
    new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-handler')),
      architecture: props.architecture,
    });
  }
}
```

You may want to test this stack under different conditions. For example, we want
this stack to be deployed correctly, regardless of the architecture we choose
for the Lambda function. In particular, it should work for both `ARM_64` and
`X86_64`. So you can create an `IntegTestCase` that exercises both scenarios:

```ts
interface StackUnderTestProps extends StackProps {
  architecture?: lambda.Architecture;
}

class StackUnderTest extends Stack {
  constructor(scope: Construct, id: string, props: StackUnderTestProps) {
    super(scope, id, props);
	
    new lambda.Function(this, 'Handler', {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda-handler')),
      architecture: props.architecture,
    });
  }
}

// Beginning of the test suite
const app = new App();

new IntegTest(app, 'DifferentArchitectures', {
  testCases: [
    new StackUnderTest(app, 'Stack1', {
      architecture: lambda.Architecture.ARM_64,
    }),
    new StackUnderTest(app, 'Stack2', {
      architecture: lambda.Architecture.X86_64,
    }),
  ],
});
```

This is all the instruction you need for the integration test runner to know
which stacks to synthesize, deploy and destroy. But you may also need to
customize the behavior of the runner by changing its parameters. For example:

```ts
const app = new App();

const stackUnderTest = new Stack(app, 'StackUnderTest', /* ... */);

const stack = new Stack(app, 'stack');

const testCase = new IntegTest(app, 'CustomizedDeploymentWorkflow', {
  testCases: [stackUnderTest],
  diffAssets: true,
  stackUpdateWorkflow: true,
  cdkCommandOptions: {
    deploy: {
      args: {
        requireApproval: RequireApproval.NEVER,
        json: true,
      },
	  },
    destroy: {
      args: {
        force: true,
      },
    },
  },
});
```

### IntegTestCaseStack

In the majority of cases an integration test will contain a single `IntegTestCase`.
By default when you create an `IntegTest` an `IntegTestCase` is created for you
and all of your test cases are registered to this `IntegTestCase`. The `IntegTestCase`
and `IntegTestCaseStack` constructs are only needed when it is necessary to
defined different options for individual test cases.

For example, you might want to have one test case where `diffAssets` is enabled.

```ts
declare const app: App;
declare const stackUnderTest: Stack;
const testCaseWithAssets = new IntegTestCaseStack(app, 'TestCaseAssets', {
  diffAssets: true,
});

new IntegTest(app, 'Integ', { testCases: [stackUnderTest, testCaseWithAssets] });
```

## Assertions

This library also provides a utility to make assertions against the infrastructure that the integration test deploys.

The easiest way to do this is to create a `TestCase` and then access the `DeployAssert` that is automatically created.

```ts
declare const app: App;
declare const stack: Stack;

const integ = new IntegTest(app, 'Integ', { testCases: [stack] });
integ.assert.awsApiCall('S3', 'getObject');
```

### DeployAssert

Assertions are created by using the `DeployAssert` construct. This construct creates it's own `Stack` separate from
any stacks that you create as part of your integration tests. This `Stack` is treated differently from other stacks
by the `integ-runner` tool. For example, this stack will not be diffed by the `integ-runner`.

Any assertions that you create should be created in the scope of `DeployAssert`. For example,

```ts
declare const app: App;

const assert = new DeployAssert(app);
new AwsApiCall(assert, 'GetObject', {
  service: 'S3',
  api: 'getObject',
});
```

`DeployAssert` also provides utilities to register your own assertions.

```ts
declare const myCustomResource: CustomResource;
declare const app: App;
const assert = new DeployAssert(app);
assert.assert(
  'CustomAssertion',
  ExpectedResult.objectLike({ foo: 'bar' }),
  ActualResult.fromCustomResource(myCustomResource, 'data'),
);
```

In the above example an assertion is created that will trigger a user defined `CustomResource`
and assert that the `data` attribute is equal to `{ foo: 'bar' }`.

### AwsApiCall

A common method to retrieve the "actual" results to compare with what is expected is to make an
AWS API call to receive some data. This library does this by utilizing CloudFormation custom resources
which means that CloudFormation will call out to a Lambda Function which will
use the AWS JavaScript SDK to make the API call.

This can be done by using the class directory:

```ts
declare const assert: DeployAssert;

new AwsApiCall(assert, 'MyAssertion', {
  service: 'SQS',
  api: 'receiveMessage',
  parameters: {
    QueueUrl: 'url',
  },
});
```

Or by using the `awsApiCall` method on `DeployAssert`:

```ts
declare const app: App;
const assert = new DeployAssert(app);
assert.awsApiCall('SQS', 'receiveMessage', {
  QueueUrl: 'url',
});
```

### EqualsAssertion

This library currently provides the ability to assert that two values are equal
to one another by utilizing the `EqualsAssertion` class. This utilizes a Lambda
backed `CustomResource` which in tern uses the [Match](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.assertions.Match.html) utility from the
[@aws-cdk/assertions](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.assertions-readme.html) library. 


```ts
declare const app: App;
declare const stack: Stack;
declare const queue: sqs.Queue;
declare const fn: lambda.IFunction;

const integ = new IntegTest(app, 'Integ', {
  testCases: [stack],
});

integ.assert.invokeFunction({
  functionName: fn.functionName,
  invocationType: InvocationType.EVENT,
  payload: JSON.stringify({ status: 'OK' }),
});

const message = integ.assert.awsApiCall('SQS', 'receiveMessage', {
  QueueUrl: queue.queueUrl,
  WaitTimeSeconds: 20,
});

new EqualsAssertion(integ.assert, 'ReceiveMessage', {
  actual: ActualResult.fromAwsApiCall(message, 'Messages.0.Body'),
  expected: ExpectedResult.objectLike({
    requestContext: {
      condition: 'Success',
    },
    requestPayload: {
      status: 'OK',
    },
    responseContext: {
      statusCode: 200,
    },
    responsePayload: 'success',
  }),
});
```

#### Match

`integ-tests` also provides a `Match` utility similar to the `@aws-cdk/assertions` module. `Match`
can be used to construct the `ExpectedResult`.

```ts
declare const message: AwsApiCall;
declare const assert: DeployAssert;

message.assert(ExpectedResult.objectLike({
  Messages: Match.arrayWith([
    {
	  Body: {
	    Values: Match.arrayWith([{ Asdf: 3 }]),
		Message: Match.stringLikeRegexp('message'),
	  },
    },
  ]),
}));
```

### Examples

#### Invoke a Lambda Function

In this example there is a Lambda Function that is invoked and
we assert that the payload that is returned is equal to '200'.

```ts
declare const lambdaFunction: lambda.IFunction;
declare const app: App;

const stack = new Stack(app, 'cdk-integ-lambda-bundling');

const integ = new IntegTest(app, 'IntegTest', {
  testCases: [stack],
});

const invoke = integ.assert.invokeFunction({
  functionName: lambdaFunction.functionName,
});
invoke.assert(ExpectedResult.objectLike({
  Payload: '200',
}));
```

#### Make an AWS API Call

In this example there is a StepFunctions state machine that is executed
and then we assert that the result of the execution is successful.

```ts
declare const app: App;
declare const stack: Stack;
declare const sm: IStateMachine;

const testCase = new IntegTest(app, 'IntegTest', {
  testCases: [stack],
});

// Start an execution
const start = testCase.assert.awsApiCall('StepFunctions', 'startExecution', {
  stateMachineArn: sm.stateMachineArn,
});

// describe the results of the execution
const describe = testCase.assert.awsApiCall('StepFunctions', 'describeExecution', {
  executionArn: start.getAttString('executionArn'),
});

// assert the results
describe.assert(ExpectedResult.objectLike({
  status: 'SUCCEEDED',
}));
```


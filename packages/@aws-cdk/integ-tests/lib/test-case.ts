import { IntegManifest, Manifest, TestCase, TestOptions } from '@aws-cdk/cloud-assembly-schema';
import { attachCustomSynthesis, Stack, ISynthesisSession, StackProps } from '@aws-cdk/core';
import { Construct } from 'constructs';
import { DeployAssert } from './assertions';
import { IntegManifestSynthesizer } from './manifest-synthesizer';

const TEST_CASE_STACK_SYMBOL = Symbol.for('@aws-cdk/integ-tests.IntegTestCaseStack');

// keep this import separate from other imports to reduce chance for merge conflicts with v2-main
// eslint-disable-next-line no-duplicate-imports, import/order
import { Construct as CoreConstruct } from '@aws-cdk/core';

/**
 * Properties of an integration test case
 */
export interface IntegTestCaseProps extends TestOptions {
  /**
   * Stacks to be deployed during the test
   */
  readonly stacks: Stack[];
}

/**
 * An integration test case. Allows the definition of test properties that
 * apply to all stacks under this case.
 *
 * It is recommended that you use the IntegTest construct since that will create
 * a default IntegTestCase
 */
export class IntegTestCase extends CoreConstruct {
  /**
   * Make assertions on resources in this test case
   */
  public readonly assert: DeployAssert;

  constructor(scope: Construct, id: string, private readonly props: IntegTestCaseProps) {
    super(scope, id);

    this.assert = new DeployAssert(this);
  }

  /**
   * The integration test manifest for this test case. Manifests are used
   * by the integration test runner.
   */
  get manifest(): IntegManifest {
    return {
      version: Manifest.version(),
      testCases: { [this.node.path]: this.toTestCase(this.props) },
    };
  }

  private toTestCase(props: IntegTestCaseProps): TestCase {
    return {
      ...props,
      assertionStack: Stack.of(this.assert).artifactId,
      stacks: props.stacks.map(s => s.artifactId),
    };
  }
}

/**
 * Properties of an integration test case stack
 */
export interface IntegTestCaseStackProps extends TestOptions, StackProps {}

/**
 * An integration test case stack. Allows the definition of test properties
 * that should apply to this stack.
 *
 * This should be used if there are multiple stacks in the integration test
 * and it is necessary to specify different test case option for each. Otherwise
 * normal stacks should be added to IntegTest
 */
export class IntegTestCaseStack extends Stack {
  /**
   * Returns whether the construct is a IntegTestCaseStack
   */
  public static isIntegTestCaseStack(x: any): x is IntegTestCaseStack {
    return x !== null && typeof(x) === 'object' && TEST_CASE_STACK_SYMBOL in x;
  }

  /**
   * Make assertions on resources in this test case
   */
  public readonly assert: DeployAssert;

  /**
   * The underlying IntegTestCase that is created
   * @internal
   */
  public readonly _testCase: IntegTestCase;

  constructor(scope: Construct, id: string, props?: IntegTestCaseStackProps) {
    super(scope, id, props);

    Object.defineProperty(this, TEST_CASE_STACK_SYMBOL, { value: true });

    // TODO: should we only have a single DeployAssert per test?
    this.assert = new DeployAssert(this);
    this._testCase = new IntegTestCase(this, `${id}TestCase`, {
      ...props,
      stacks: [this],
    });
  }

}

/**
 * Integration test properties
 */
export interface IntegTestProps extends TestOptions {
  /**
   * List of test cases that make up this test
   */
  readonly testCases: Stack[];
}

/**
 * A collection of test cases. Each test case file should contain exactly one
 * instance of this class.
 */
export class IntegTest extends CoreConstruct {
  /**
   * Make assertions on resources in this test case
   */
  public readonly assert: DeployAssert;
  private readonly testCases: IntegTestCase[];
  constructor(scope: Construct, id: string, props: IntegTestProps) {
    super(scope, id);

    const defaultTestCase = new IntegTestCase(this, 'DefaultTest', {
      stacks: props.testCases.filter(stack => !IntegTestCaseStack.isIntegTestCaseStack(stack)),
      hooks: props.hooks,
      regions: props.regions,
      diffAssets: props.diffAssets,
      allowDestroy: props.allowDestroy,
      cdkCommandOptions: props.cdkCommandOptions,
      stackUpdateWorkflow: props.stackUpdateWorkflow,
    });
    this.assert = defaultTestCase.assert;

    this.testCases = [
      defaultTestCase,
      ...props.testCases
        .filter(stack => IntegTestCaseStack.isIntegTestCaseStack(stack))
        .map(stack => (stack as IntegTestCaseStack)._testCase),
    ];
  }


  protected onPrepare(): void {
    attachCustomSynthesis(this, {
      onSynthesize: (session: ISynthesisSession) => {
        const synthesizer = new IntegManifestSynthesizer(this.testCases);
        synthesizer.synthesize(session);
      },
    });
  }
}

import * as iam from '@aws-cdk/aws-iam';
import * as firehose from '@aws-cdk/aws-kinesisfirehose';
import * as logs from '@aws-cdk/aws-logs';
import { Construct, Node } from 'constructs';

export interface DestinationLoggingProps {
  /**
   * If true, log errors when data transformation or data delivery fails.
   *
   * If `logGroup` is provided, this will be implicitly set to `true`.
   *
   * @default true - errors are logged.
   */
  readonly logging?: boolean;

  /**
   * The CloudWatch log group where log streams will be created to hold error logs.
   *
   * @default - if `logging` is set to `true`, a log group will be created for you.
   */
  readonly logGroup?: logs.ILogGroup;

  /**
   * The IAM role associated with this destination.
   */
  readonly role: iam.IRole;

  /**
   * The ID of the stream that is created in the log group where logs will be placed.
   *
   * Must be unique within the log group, so should be different every time this function is called.
   */
  readonly streamId: string;
}

export function createLoggingOptions(
  scope: Construct,
  props: DestinationLoggingProps,
): firehose.CfnDeliveryStream.CloudWatchLoggingOptionsProperty | undefined {
  if (props.logging === false && props.logGroup) {
    throw new Error('logging cannot be set to false when logGroup is provided');
  }
  if (props.logging !== false || props.logGroup) {
    const logGroup = Node.of(scope).tryFindChild('LogGroup') as logs.ILogGroup ?? props.logGroup ?? new logs.LogGroup(scope, 'LogGroup');
    logGroup.grantWrite(props.role);
    return {
      enabled: true,
      logGroupName: logGroup.logGroupName,
      logStreamName: logGroup.addStream(props.streamId).logStreamName,
    };
  }
  return undefined;
}

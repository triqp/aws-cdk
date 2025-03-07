import { Template } from '@aws-cdk/assertions';
import { testDeprecated } from '@aws-cdk/cdk-build-tools';
import { Duration, Stack, App, CfnResource } from '@aws-cdk/core';
import { AnyPrincipal, ArnPrincipal, CompositePrincipal, FederatedPrincipal, ManagedPolicy, PolicyStatement, Role, ServicePrincipal, User, Policy, PolicyDocument } from '../lib';

describe('IAM role', () => {
  test('default role', () => {
    const stack = new Stack();

    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    });

    Template.fromStack(stack).templateMatches({
      Resources:
      {
        MyRoleF48FFE04:
         {
           Type: 'AWS::IAM::Role',
           Properties:
          {
            AssumeRolePolicyDocument:
           {
             Statement:
            [{
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: 'sns.amazonaws.com' },
            }],
             Version: '2012-10-17',
           },
          },
         },
      },
    });
  });

  test('a role can grant PassRole permissions', () => {
    // GIVEN
    const stack = new Stack();
    const role = new Role(stack, 'Role', { assumedBy: new ServicePrincipal('henk.amazonaws.com') });
    const user = new User(stack, 'User');

    // WHEN
    role.grantPassRole(user);

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'iam:PassRole',
            Effect: 'Allow',
            Resource: { 'Fn::GetAtt': ['Role1ABCC5F0', 'Arn'] },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  testDeprecated('can supply externalId', () => {
    // GIVEN
    const stack = new Stack();

    // WHEN
    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      externalId: 'SomeSecret',
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: { 'sts:ExternalId': 'SomeSecret' },
            },
            Effect: 'Allow',
            Principal: { Service: 'sns.amazonaws.com' },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  test('can supply single externalIds', () => {
    // GIVEN
    const stack = new Stack();

    // WHEN
    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      externalIds: ['SomeSecret'],
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: { 'sts:ExternalId': 'SomeSecret' },
            },
            Effect: 'Allow',
            Principal: { Service: 'sns.amazonaws.com' },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  test('can supply multiple externalIds', () => {
    // GIVEN
    const stack = new Stack();

    // WHEN
    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      externalIds: ['SomeSecret', 'AnotherSecret'],
    });

    // THEN
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Condition: {
              StringEquals: { 'sts:ExternalId': ['SomeSecret', 'AnotherSecret'] },
            },
            Effect: 'Allow',
            Principal: { Service: 'sns.amazonaws.com' },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  test('policy is created automatically when permissions are added', () => {
    // by default we don't expect a role policy
    const before = new Stack();
    new Role(before, 'MyRole', { assumedBy: new ServicePrincipal('sns.amazonaws.com') });
    Template.fromStack(before).resourceCountIs('AWS::IAM::Policy', 0);

    // add a policy to the role
    const after = new Stack();
    const afterRole = new Role(after, 'MyRole', { assumedBy: new ServicePrincipal('sns.amazonaws.com') });
    afterRole.addToPolicy(new PolicyStatement({ resources: ['myresource'], actions: ['service:myaction'] }));
    Template.fromStack(after).hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'service:myaction',
            Effect: 'Allow',
            Resource: 'myresource',
          },
        ],
        Version: '2012-10-17',
      },
      PolicyName: 'MyRoleDefaultPolicyA36BE1DD',
      Roles: [
        {
          Ref: 'MyRoleF48FFE04',
        },
      ],
    });

  });

  test('managed policy arns can be supplied upon initialization and also added later', () => {
    const stack = new Stack();

    const role = new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('test.service'),
      managedPolicies: [{ managedPolicyArn: 'managed1' }, { managedPolicyArn: 'managed2' }],
    });

    role.addManagedPolicy({ managedPolicyArn: 'managed3' });
    Template.fromStack(stack).templateMatches({
      Resources:
      {
        MyRoleF48FFE04:
         {
           Type: 'AWS::IAM::Role',
           Properties:
          {
            AssumeRolePolicyDocument:
           {
             Statement:
            [{
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: 'test.service' },
            }],
             Version: '2012-10-17',
           },
            ManagedPolicyArns: ['managed1', 'managed2', 'managed3'],
          },
         },
      },
    });

  });

  test('federated principal can change AssumeRoleAction', () => {
    const stack = new Stack();
    const cognitoPrincipal = new FederatedPrincipal(
      'foo',
      { StringEquals: { key: 'value' } },
      'sts:AssumeSomething');

    new Role(stack, 'MyRole', { assumedBy: cognitoPrincipal });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Principal: { Federated: 'foo' },
            Condition: {
              StringEquals: { key: 'value' },
            },
            Action: 'sts:AssumeSomething',
            Effect: 'Allow',
          },
        ],
      },
    });
  });

  test('role path can be used to specify the path', () => {
    const stack = new Stack();

    new Role(stack, 'MyRole', { path: '/', assumedBy: new ServicePrincipal('sns.amazonaws.com') });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      Path: '/',
    });
  });

  test('role path can be 1 character', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    expect(() => new Role(stack, 'MyRole', { assumedBy, path: '/' })).not.toThrowError();
  });

  test('role path cannot be empty', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    expect(() => new Role(stack, 'MyRole', { assumedBy, path: '' }))
      .toThrow('Role path must be between 1 and 512 characters. The provided role path is 0 characters.');
  });

  test('role path must be less than or equal to 512', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    expect(() => new Role(stack, 'MyRole', { assumedBy, path: '/' + Array(512).join('a') + '/' }))
      .toThrow('Role path must be between 1 and 512 characters. The provided role path is 513 characters.');
  });

  test('role path must start with a forward slash', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    const expected = (val: any) => 'Role path must be either a slash or valid characters (alphanumerics and symbols) surrounded by slashes. '
    + `Valid characters are unicode characters in [\\u0021-\\u007F]. However, ${val} is provided.`;
    expect(() => new Role(stack, 'MyRole', { assumedBy, path: 'aaa' })).toThrow(expected('aaa'));
  });

  test('role path must end with a forward slash', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    const expected = (val: any) => 'Role path must be either a slash or valid characters (alphanumerics and symbols) surrounded by slashes. '
    + `Valid characters are unicode characters in [\\u0021-\\u007F]. However, ${val} is provided.`;
    expect(() => new Role(stack, 'MyRole', { assumedBy, path: '/a' })).toThrow(expected('/a'));
  });

  test('role path must contain unicode chars within [\\u0021-\\u007F]', () => {
    const stack = new Stack();

    const assumedBy = new ServicePrincipal('bla');

    const expected = (val: any) => 'Role path must be either a slash or valid characters (alphanumerics and symbols) surrounded by slashes. '
    + `Valid characters are unicode characters in [\\u0021-\\u007F]. However, ${val} is provided.`;
    expect(() => new Role(stack, 'MyRole', { assumedBy, path: '/\u0020\u0080/' })).toThrow(expected('/\u0020\u0080/'));
  });

  describe('maxSessionDuration', () => {

    test('is not specified by default', () => {
      const stack = new Stack();
      new Role(stack, 'MyRole', { assumedBy: new ServicePrincipal('sns.amazonaws.com') });
      Template.fromStack(stack).templateMatches({
        Resources: {
          MyRoleF48FFE04: {
            Type: 'AWS::IAM::Role',
            Properties: {
              AssumeRolePolicyDocument: {
                Statement: [
                  {
                    Action: 'sts:AssumeRole',
                    Effect: 'Allow',
                    Principal: {
                      Service: 'sns.amazonaws.com',
                    },
                  },
                ],
                Version: '2012-10-17',
              },
            },
          },
        },
      });
    });

    test('can be used to specify the maximum session duration for assuming the role', () => {
      const stack = new Stack();

      new Role(stack, 'MyRole', { maxSessionDuration: Duration.seconds(3700), assumedBy: new ServicePrincipal('sns.amazonaws.com') });

      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
        MaxSessionDuration: 3700,
      });
    });

    test('must be between 3600 and 43200', () => {
      const stack = new Stack();

      const assumedBy = new ServicePrincipal('bla');

      new Role(stack, 'MyRole1', { assumedBy, maxSessionDuration: Duration.hours(1) });
      new Role(stack, 'MyRole2', { assumedBy, maxSessionDuration: Duration.hours(12) });

      const expected = (val: any) => `maxSessionDuration is set to ${val}, but must be >= 3600sec (1hr) and <= 43200sec (12hrs)`;
      expect(() => new Role(stack, 'MyRole3', { assumedBy, maxSessionDuration: Duration.minutes(1) }))
        .toThrow(expected(60));
      expect(() => new Role(stack, 'MyRole4', { assumedBy, maxSessionDuration: Duration.seconds(3599) }))
        .toThrow(expected(3599));
      expect(() => new Role(stack, 'MyRole5', { assumedBy, maxSessionDuration: Duration.seconds(43201) }))
        .toThrow(expected(43201));
    });
  });

  test('allow role with multiple principals', () => {
    const stack = new Stack();

    new Role(stack, 'MyRole', {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal('boom.amazonaws.test'),
        new ArnPrincipal('1111111'),
      ),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'boom.amazonaws.test',
            },
          },
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              AWS: '1111111',
            },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  test('can supply permissions boundary managed policy', () => {
    // GIVEN
    const stack = new Stack();

    const permissionsBoundary = ManagedPolicy.fromAwsManagedPolicyName('managed-policy');

    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      permissionsBoundary,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      PermissionsBoundary: {
        'Fn::Join': [
          '',
          [
            'arn:',
            {
              Ref: 'AWS::Partition',
            },
            ':iam::aws:policy/managed-policy',
          ],
        ],
      },
    });
  });

  test('Principal-* in an AssumeRolePolicyDocument gets translated to { "AWS": "*" }', () => {
    // The docs say that "Principal: *" and "Principal: { AWS: * }" are equivalent
    // (https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html)
    // but in practice CreateRole errors out if you use "Principal: *" in an AssumeRolePolicyDocument:
    // An error occurred (MalformedPolicyDocument) when calling the CreateRole operation: AssumeRolepolicy contained an invalid principal: "STAR":"*".

    // Make sure that we handle this case specially.
    const stack = new Stack();
    new Role(stack, 'Role', {
      assumedBy: new AnyPrincipal(),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { AWS: '*' },
          },
        ],
        Version: '2012-10-17',
      },
    });
  });

  test('can have a description', () => {
    const stack = new Stack();

    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      description: 'This is a role description.',
    });

    Template.fromStack(stack).templateMatches({
      Resources:
      {
        MyRoleF48FFE04:
         {
           Type: 'AWS::IAM::Role',
           Properties:
          {
            AssumeRolePolicyDocument:
           {
             Statement:
            [{
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: 'sns.amazonaws.com' },
            }],
             Version: '2012-10-17',
           },
            Description: 'This is a role description.',
          },
         },
      },
    });
  });

  test('should not have an empty description', () => {
    const stack = new Stack();

    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      description: '',
    });

    Template.fromStack(stack).templateMatches({
      Resources:
      {
        MyRoleF48FFE04:
         {
           Type: 'AWS::IAM::Role',
           Properties:
          {
            AssumeRolePolicyDocument:
           {
             Statement:
            [{
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: { Service: 'sns.amazonaws.com' },
            }],
             Version: '2012-10-17',
           },
          },
         },
      },
    });
  });

  test('description can only be 1000 characters long', () => {
    const stack = new Stack();

    expect(() => {
      new Role(stack, 'MyRole', {
        assumedBy: new ServicePrincipal('sns.amazonaws.com'),
        description: '1000+ character long description: Lorem ipsum dolor sit amet, consectetuer adipiscing elit. \
        Aenean commodo ligula eget dolor. Aenean massa. Cum sociis natoque penatibus et magnis dis parturient montes, \
        nascetur ridiculus mus. Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat \
        massa quis enim. Donec pede justo, fringilla vel, aliquet nec, vulputate eget, arcu. In enim justo, rhoncus ut, \
        imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt. Cras dapibus. \
        Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, \
        eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus. Phasellus viverra nulla ut metus \
        varius laoreet. Quisque rutrum. Aenean imperdiet. Etiam ultricies nisi vel augue. Curabitur ullamcorper ultricies nisi. \
        Nam eget dui. Etiam rhoncus. Maecenas tempus, tellus eget condimentum rhoncus, sem quam semper libero, sit amet adipiscing \
        sem neque sed ipsum.',
      });
    }).toThrow(/Role description must be no longer than 1000 characters./);
  });

  test('fails if managed policy is invalid', () => {
    const app = new App();
    const stack = new Stack(app, 'my-stack');
    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      managedPolicies: [new ManagedPolicy(stack, 'MyManagedPolicy', {
        statements: [new PolicyStatement({
          resources: ['*'],
          actions: ['*'],
          principals: [new ServicePrincipal('sns.amazonaws.com')],
        })],
      })],
    });

    expect(() => app.synth()).toThrow(/A PolicyStatement used in an identity-based policy cannot specify any IAM principals/);
  });

  test('fails if default role policy is invalid', () => {
    const app = new App();
    const stack = new Stack(app, 'my-stack');
    const role = new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    });
    role.addToPrincipalPolicy(new PolicyStatement({
      resources: ['*'],
      actions: ['*'],
      principals: [new ServicePrincipal('sns.amazonaws.com')],
    }));

    expect(() => app.synth()).toThrow(/A PolicyStatement used in an identity-based policy cannot specify any IAM principals/);
  });

  test('fails if inline policy from props is invalid', () => {
    const app = new App();
    const stack = new Stack(app, 'my-stack');
    new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      inlinePolicies: {
        testPolicy: new PolicyDocument({
          statements: [new PolicyStatement({
            resources: ['*'],
            actions: ['*'],
            principals: [new ServicePrincipal('sns.amazonaws.com')],
          })],
        }),
      },
    });

    expect(() => app.synth()).toThrow(/A PolicyStatement used in an identity-based policy cannot specify any IAM principals/);
  });

  test('fails if attached inline policy is invalid', () => {
    const app = new App();
    const stack = new Stack(app, 'my-stack');
    const role = new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    });
    role.attachInlinePolicy(new Policy(stack, 'MyPolicy', {
      statements: [new PolicyStatement({
        resources: ['*'],
        actions: ['*'],
        principals: [new ServicePrincipal('sns.amazonaws.com')],
      })],
    }));

    expect(() => app.synth()).toThrow(/A PolicyStatement used in an identity-based policy cannot specify any IAM principals/);
  });

  test('fails if assumeRolePolicy is invalid', () => {
    const app = new App();
    const stack = new Stack(app, 'my-stack');
    const role = new Role(stack, 'MyRole', {
      assumedBy: new ServicePrincipal('sns.amazonaws.com'),
      managedPolicies: [new ManagedPolicy(stack, 'MyManagedPolicy')],
    });
    role.assumeRolePolicy?.addStatements(new PolicyStatement({ actions: ['*'] }));

    expect(() => app.synth()).toThrow(/A PolicyStatement used in a resource-based policy must specify at least one IAM principal/);
  });
});

test('managed policy ARNs are deduplicated', () => {
  const app = new App();
  const stack = new Stack(app, 'my-stack');
  const role = new Role(stack, 'MyRole', {
    assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    managedPolicies: [
      ManagedPolicy.fromAwsManagedPolicyName('SuperDeveloper'),
      ManagedPolicy.fromAwsManagedPolicyName('SuperDeveloper'),
    ],
  });
  role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('SuperDeveloper'));

  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
    ManagedPolicyArns: [
      {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':iam::aws:policy/SuperDeveloper',
          ],
        ],
      },
    ],
  });
});

test('cross-env role ARNs include path', () => {
  const app = new App();
  const roleStack = new Stack(app, 'role-stack', { env: { account: '123456789012', region: 'us-east-1' } });
  const referencerStack = new Stack(app, 'referencer-stack', { env: { region: 'us-east-2' } });
  const role = new Role(roleStack, 'Role', {
    assumedBy: new ServicePrincipal('sns.amazonaws.com'),
    path: '/sample/path/',
    roleName: 'sample-name',
  });
  new CfnResource(referencerStack, 'Referencer', {
    type: 'Custom::RoleReferencer',
    properties: { RoleArn: role.roleArn },
  });

  Template.fromStack(referencerStack).hasResourceProperties('Custom::RoleReferencer', {
    RoleArn: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':iam::123456789012:role/sample/path/sample-name',
        ],
      ],
    },
  });
});

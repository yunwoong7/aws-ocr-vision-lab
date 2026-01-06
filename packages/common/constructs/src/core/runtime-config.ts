import { Stack, Stage } from 'aws-cdk-lib';
import { Construct } from 'constructs';

const RuntimeConfigKey = '__RuntimeConfig__';

export interface CognitoProps {
  region: string;
  identityPoolId: string;
  userPoolId: string;
  userPoolWebClientId: string;
}

export interface RuntimeConfigValues {
  apiUrl?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  identityPoolId?: string;
  cognitoProps?: CognitoProps;
}

export class RuntimeConfig extends Construct {
  private readonly _runtimeConfig: RuntimeConfigValues = {};

  static ensure(scope: Construct): RuntimeConfig {
    const parent = Stage.of(scope) ?? Stack.of(scope);
    return (
      RuntimeConfig.of(scope) ?? new RuntimeConfig(parent, RuntimeConfigKey)
    );
  }

  static of(scope: Construct): RuntimeConfig | undefined {
    const parent = Stage.of(scope) ?? Stack.of(scope);
    return parent.node.tryFindChild(RuntimeConfigKey) as
      | RuntimeConfig
      | undefined;
  }

  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  get config(): RuntimeConfigValues {
    return this._runtimeConfig;
  }
}

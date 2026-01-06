import React, { PropsWithChildren, useEffect } from 'react';
import { AuthProvider, AuthProviderProps, useAuth } from 'react-oidc-context';
import { Alert } from '../alert';
import { Spinner } from '../spinner';
import { useRuntimeConfig } from '../../hooks/useRuntimeConfig';

/**
 * Sets up the Cognito auth.
 *
 * This assumes a runtime-config.json file is present at '/'. In order for Auth to be set up automatically,
 * the runtime-config.json must have the cognitoProps set.
 */
const CognitoAuth: React.FC<PropsWithChildren> = ({ children }) => {
  const { cognitoProps } = useRuntimeConfig();

  if (!cognitoProps) {
    if (import.meta.env.MODE === 'serve-local') {
      // In serve-local mode with no cognitoProps available, we skip login
      return <AuthProvider>{children}</AuthProvider>;
    }
    return (
      <Alert type="error" header="Runtime config configuration error">
        <p>
          The cognitoProps have not been configured in the runtime-config.json.
        </p>
      </Alert>
    );
  }

  const cognitoAuthConfig: AuthProviderProps = {
    authority: `https://cognito-idp.${cognitoProps.region}.amazonaws.com/${cognitoProps.userPoolId}`,
    client_id: cognitoProps.userPoolWebClientId,
    redirect_uri: window.location.origin,
    response_type: 'code',
    scope: 'email openid profile',
    // Auto token renewal settings
    automaticSilentRenew: true,
    // Renew token 5 minutes before expiry
    accessTokenExpiringNotificationTimeInSeconds: 300,
    // Handle silent renew errors
    onSigninCallback: () => {
      // Remove OIDC params from URL after successful signin
      window.history.replaceState({}, document.title, window.location.pathname);
    },
  };

  return (
    <AuthProvider {...cognitoAuthConfig}>
      <CognitoAuthInternal>{children}</CognitoAuthInternal>
    </AuthProvider>
  );
};

const CognitoAuthInternal: React.FC<PropsWithChildren> = ({ children }) => {
  const auth = useAuth();

  useEffect(() => {
    // Handle silent renew errors by redirecting to login
    const handleSilentRenewError = () => {
      console.log('Silent renew failed, redirecting to login...');
      auth.signinRedirect();
    };

    // Add event listener for silent renew errors
    if (auth.events) {
      auth.events.addSilentRenewError(handleSilentRenewError);
      return () => {
        auth.events.removeSilentRenewError(handleSilentRenewError);
      };
    }
  }, [auth]);

  useEffect(() => {
    if (!auth.isAuthenticated && !auth.isLoading && !auth.activeNavigator) {
      auth.signinRedirect();
    }
  }, [auth]);

  if (auth.isAuthenticated) {
    return children;
  }

  if (auth.error) {
    // If there's an auth error, try to re-authenticate
    console.error('Auth error:', auth.error);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '16px',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
        }}
      >
        <p>Session expired. Redirecting to login...</p>
        <button
          onClick={() => auth.signinRedirect()}
          style={{
            padding: '10px 20px',
            background: 'var(--primary)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Login Again
        </button>
      </div>
    );
  }

  return <Spinner />;
};

export default CognitoAuth;

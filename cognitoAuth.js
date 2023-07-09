import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'   //


const username = process.env.TEST_USER_EMAIL
const password = process.env.TEST_USER_PW
const clientId = process.env.COGNITO_CLIENT_ID
const aws_region = process.env.AWS_REGION


export const generateIdToken = async () => {

  const client = new CognitoIdentityProviderClient({ region: aws_region })

  const params = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password
    }
  }

  const data = await client.send(new InitiateAuthCommand(params))

  return data.AuthenticationResult.IdToken
}
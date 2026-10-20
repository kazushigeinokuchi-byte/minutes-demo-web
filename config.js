// Cognitoで確認したドメインと、公開後の正確なURLを設定してください。
// シークレット、APIキー、パスワードは記載しないでください。
window.MINUTES_CONFIG = Object.freeze({
  domain: 'https://ap-northeast-1za5bpwdah.auth.ap-northeast-1.amazoncognito.com',
  redirectUri: 'https://kazushigeinokuchi-byte.github.io/minutes-demo-web/',
  clientId: '2cbb1scn789k5k6q2ib72irs7j',
  issuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_za5BPWDaH',
  apiBase: 'https://kmo63ygkca.execute-api.ap-northeast-1.amazonaws.com/demo',
  scope: 'openid minutes-demo/use'
});

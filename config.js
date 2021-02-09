'use strict'

const convict = require('convict')
const path = require('path')

const schema = {
  akismet: {
    site: {
      doc: 'URL of an Akismet account used for spam checking.',
      docExample: 'http://yourdomain.com',
      format: String,
      default: null,
      env: 'AKISMET_SITE'
    },
    apiKey: {
      doc: 'API key to be used with Akismet.',
      format: String,
      default: null,
      env: 'AKISMET_API_KEY'
    },
    bypassValue: {
      doc: 'Value to pass in as comment author, author email, author URL, or content in order to bypass Akismet spam-checking. Intended to be used for testing in lieu of disabling Akismet via the site config.',
      format: String,
      default: null,
      env: 'AKISMET_BYPASS_VALUE'
    }
  },
  analytics: {
    uaTrackingId: {
      doc: 'Universal Analytics account ID.',
      docExample: 'uaTrackingId: "UA-XXXX-XX"',
      format: String,
      default: null,
      env: 'UA_TRACKING_ID'
    }
  },
  email: {
    apiKey: {
      doc: 'Mailgun API key to be used for email notifications. Will be overridden by a `notifications.apiKey` parameter in the site config, if one is set.',
      format: String,
      default: null,
      env: 'EMAIL_API_KEY'
    },
    domain: {
      doc: 'Domain to be used with Mailgun for email notifications. Will be overridden by a `notifications.domain` parameter in the site config, if one is set.',
      format: String,
      default: 'staticman.net',
      env: 'EMAIL_DOMAIN'
    },
    fromAddress: {
      doc: 'Email address to send notifications from.',
      format: String,
      default: 'noreply@staticman.net',
      env: 'EMAIL_FROM'
    },
    fromName: {
      doc: 'Name of the sender to put on notification emails.',
      format: String,
      default: 'Staticman',
      env: 'EMAIL_FROM_NAME'
    }
  },
  env: {
    doc: 'The applicaton environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV'
  },
  githubAccessTokenUri: {
    doc: 'URI for the GitHub authentication provider.',
    format: String,
    default: 'https://github.com/login/oauth/access_token',
    env: 'GITHUB_ACCESS_TOKEN_URI'
  },
  githubAppID: {
    doc: 'ID of the GitHub App.',
    format: String,
    default: null,
    env: 'GITHUB_APP_ID'
  },
  githubBaseUrl: {
    doc: 'Base URL for the GitHub API.',
    format: String,
    default: 'https://api.github.com',
    env: 'GITHUB_BASE_URL'
  },
  githubPrivateKey: {
    doc: 'Private key for the GitHub App.',
    format: String,
    default: null,
    env: 'GITHUB_PRIVATE_KEY'
  },
  githubToken: {
    doc: 'Access token to the GitHub account (legacy)',
    format: String,
    default: null,
    env: 'GITHUB_TOKEN'
  },
  gitlabAccessTokenUri: {
    doc: 'URI for the GitLab authentication provider.',
    format: String,
    default: 'https://gitlab.com/oauth/token',
    env: 'GITLAB_ACCESS_TOKEN_URI'
  },
  gitlabBaseUrl: {
    doc: 'Base URL for the GitLab API.',
    format: String,
    default: 'https://gitlab.com',
    env: 'GITLAB_BASE_URL'
  },
  gitlabToken: {
    doc: 'Access token to the GitLab account being used to push files with.',
    format: String,
    default: null,
    env: 'GITLAB_TOKEN'
  },
  port: {
    doc: 'The port to bind the application to.',
    format: 'port',
    default: 0,
    env: 'PORT'
  },
  rsaPrivateKey: {
    doc: 'RSA private key to encrypt sensitive configuration parameters with.',
    docExample: 'rsaPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----"',
    format: String,
    default: null,
    env: 'RSA_PRIVATE_KEY'
  },
  cryptoPepper: {
    doc: 'Shared (app-wide) secret that can be used to verify the authenticity of hashed/encrypted strings that we create. Should be long to defend against brute force attacks.',
    docExample: 'bcacf76bef428bf6115abfaa664e73481657e5068b9534227dca6ec96c6931b113105be81cb177b4e22d42fbc32d04ea5a8133e97296de7852328',
    format: String,
    default: null,
    env: 'CRYPTO_PEPPER'
  },
  logging: {
    slackWebhook: {
      doc: 'Slack webhook URL to pipe log output to',
      format: String,
      default: null,
      env: 'SLACK_WEBHOOK'
    }
  },
  commentIdGenerator: {
    doc: 'The scheme to use for generating IDs for comments. More info about nanoid - https://github.com/ai/nanoid',
    format: ['uuid', 'nanoid', 'nanoid-lowercase'],
    default: 'uuid',
    env: 'COMMENT_ID_GENERATOR'
  },
  commentIdLength: {
    doc: 'The desired length of generated comment IDs. Only applicable when commentIdGenerator is set to "nanoid" or "nanoid-lowercase"',
    format: Number,
    default: 21,
    env: 'COMMENT_ID_LENGTH'
  }
}

let config

try {
  config = convict(schema)

  const fileName = 'config.' + config.get('env') + '.json'

  config.loadFile(path.join(__dirname, fileName))
  config.validate()

  console.log('(*) Local config file loaded')
} catch (e) {

}

module.exports = config
module.exports.schema = schema

'use strict'

const bufferEq = require('buffer-equal-constant-time')
const path = require('path')
const config = require(path.join(__dirname, '/../config'))
const crypto = require('crypto')

const gitFactory = require('../lib/GitServiceFactory')
const Staticman = require('../lib/Staticman')

/**
 * Express handler for webhook requests/notifications generated by the backing git service.
 */
module.exports = async (req, res, next) => {
  // Allow for multiple errors to be raised and reported back.
  let errorsRaised = []

  let service = req.params.service
  const version = req.params.version
  let staticman = null
  let configBranch = null
  // v1 of the webhook endpoint assumed GitHub.
  if (!service && version === '1') {
    service = 'github'
  } else {
    /*
     * In versions of the webhook endpoint beyond v1, we have the parameters necessary to
     * instantiate a Staticman instance right away.
     */
    service = req.params.service
    staticman = await new Staticman(req.params)
    staticman.setConfigPath()

    await staticman.getSiteConfig().then((siteConfig) => {
      configBranch = siteConfig.get('branch') || config.get('branch')
    }).catch((error) => {
      errorsRaised = errorsRaised.concat(error)
    })

    if (configBranch && (req.params.branch !== configBranch)) {
      console.log(`Branch check failed - configBranch = ${configBranch}, paramsBranch = ${req.params.branch}`)
      errorsRaised.push('Branch mismatch. Ignoring request.')
    }
  }

  if (errorsRaised.length === 0) {
    switch (service) {
      case 'github':
        await _handleWebhookGitHub(req, service, staticman, configBranch).catch((errors) => {
          errorsRaised = errorsRaised.concat(errors)
        })
        break
      case 'gitlab':
        await _handleWebhookGitLab(req, service, staticman, configBranch).catch((errors) => {
          errorsRaised = errorsRaised.concat(errors)
        })
        break
      default:
        errorsRaised.push('Unexpected service specified.')
    }
  }

  if (errorsRaised.length > 0) {
    res.status(400).send({
      errors: JSON.stringify(errorsRaised)
    })
  } else {
    res.status(200).send({
      success: true
    })
  }
}

const _handleWebhookGitHub = async function (req, service, staticman, configBranch) {
  let errorsRaised = []

  const event = req.headers['x-github-event']
  if (!event) {
    errorsRaised.push('No event found in the request')
  } else {
    if (event === 'pull_request') {
      let webhookSecretExpected = null
      if (staticman) {
        // Webhook request authentication is NOT supported in v1 of the endpoint.
        await staticman.getSiteConfig().then((siteConfig) => {
          webhookSecretExpected = siteConfig.get('githubWebhookSecret') || config.get('githubWebhookSecret')
        })
      }

      let reqAuthenticated = true
      if (webhookSecretExpected) {
        reqAuthenticated = false
        const webhookSecretSent = req.headers['x-hub-signature']
        if (!webhookSecretSent) {
          // This could be worth logging... unless the endpoint gets hammered with spam.
          errorsRaised.push('No secret found in the webhook request')
        } else if (_verifyGitHubSignature(webhookSecretExpected, JSON.stringify(req.body), webhookSecretSent)) {
          reqAuthenticated = true
        } else {
          // This could be worth logging... unless the endpoint gets hammered with spam.
          errorsRaised.push('Unable to verify authenticity of request')
        }
      }

      if (reqAuthenticated) {
        await _handleMergeRequest(req.params, service, req.body, staticman, configBranch).catch((errors) => {
          errorsRaised = errors
        })
      }
    }
  }

  if (errorsRaised.length > 0) {
    return Promise.reject(errorsRaised)
  }
}

const _handleWebhookGitLab = async function (req, service, staticman, configBranch) {
  let errorsRaised = []

  const event = req.headers['x-gitlab-event']
  if (!event) {
    errorsRaised.push('No event found in the request')
  } else {
    if (event === 'Merge Request Hook') {
      let webhookSecretExpected = null
      if (staticman) {
        // Webhook request authentication is NOT supported in v1 of the endpoint.
        await staticman.getSiteConfig().then((siteConfig) => {
          webhookSecretExpected = siteConfig.get('gitlabWebhookSecret') || config.get('gitlabWebhookSecret')
        })
      }

      let reqAuthenticated = true
      if (webhookSecretExpected) {
        reqAuthenticated = false
        const webhookSecretSent = req.headers['x-gitlab-token']
        if (!webhookSecretSent) {
          // This could be worth logging... unless the endpoint gets hammered with spam.
          errorsRaised.push('No secret found in the webhook request')
        } else if (webhookSecretExpected === webhookSecretSent) {
          /*
           * Whereas GitHub uses the webhook secret to sign the request body, GitLab does not.
           * As such, just check that the received secret equals the expected value.
           */
          reqAuthenticated = true
        } else {
          // This could be worth logging... unless the endpoint gets hammered with spam.
          errorsRaised.push('Unable to verify authenticity of request')
        }
      }

      if (reqAuthenticated) {
        await _handleMergeRequest(req.params, service, req.body, staticman, configBranch).catch((errors) => {
          errorsRaised = errors
        })
      }
    }
  }

  if (errorsRaised.length > 0) {
    return Promise.reject(errorsRaised)
  }
}

const _verifyGitHubSignature = function (secret, data, signature) {
  const signedData = 'sha1=' + crypto.createHmac('sha1', secret).update(data).digest('hex')
  return bufferEq(Buffer.from(signature), Buffer.from(signedData))
}

const _handleMergeRequest = async function (params, service, data, staticman, configBranch) {
  // Allow for multiple errors to be raised and reported back.
  const errors = []

  const ua = config.get('analytics.uaTrackingId')
    ? require('universal-analytics')(config.get('analytics.uaTrackingId'))
    : null

  let mergeReqNbr = null
  let mergeTargetBranch = null
  let reviewBranch = null
  let reviewBody = null
  let requestMerged = false
  if (service === 'github') {
    mergeReqNbr = data.number
    mergeTargetBranch = data.pull_request.base.ref
    reviewBranch = data.pull_request.head.ref
    reviewBody = data.pull_request.body

    /*
     * In GitHub, when a pull request is merged, in the webhook payload, "state" = "closed" and
     * "merged" = true. If the review is retrieved from GitHub, the review "state" = "merged".
     * In GitHub, when a pull request is closed, in the webhook payload, "state" = "closed" and
     * "merged" = false. If the review is retrieved from GitHub, the review "state" = "closed".
     * In short, with GitHub, we can't look at the "state" property supplied in the webhook.
     */
    requestMerged = data.pull_request.merged
  } else if (service === 'gitlab') {
    mergeReqNbr = data.object_attributes.iid
    mergeTargetBranch = data.object_attributes.target_branch
    reviewBranch = data.object_attributes.source_branch
    reviewBody = data.object_attributes.description

    /*
     * In GitLab, when a merge request is merged, in the webhook payload, "state" = "merged".
     * If the review is retrieved from GitLab, the review "state" = "merged", too.
     * In GitLab, when a merge request is closed, in the webhook payload, "state" = "closed".
     * If the review is retrieved from GitLab, the review "state" = "closed", too.
     */
    requestMerged = (data.object_attributes.state === 'merged')
  } else {
    errors.push('Unable to determine service.')
    return Promise.reject(errors)
  }
  // console.log(`mergeReqNbr = ${mergeReqNbr}, mergeTargetBranch = ${mergeTargetBranch}, reviewBranch = ${reviewBranch}, requestMerged = ${requestMerged}`)

  let branch = params.branch
  if (!configBranch && !branch) {
    console.warn('WARNING!: No target/allowed branch specified in webhook request URL or ' +
      'Staticman configuration. This could result in a non-production environment processing ' +
      'production merge requests and/or a production environment processing non-production ' +
      'merge requests (and sending notifications for them to production subscribers).')
  }

  if (!configBranch) {
    configBranch = mergeTargetBranch
  }

  if (!branch) {
    branch = mergeTargetBranch
  }
  /*
   * A merge request processed (i.e., opened, merged, closed) against one branch in a repository
   * will trigger ALL webhooks triggered by merge request events in that repository. Meaning,
   * the webhook controller running in a (for example) prod Staticman instance will receive
   * webhook calls triggered by merge request events against a (for example) dev branch. As such,
   * we should expect plenty of extraneous webhook requests. The critical criterion is the
   * (merge target) branch in the webhook payload matching the branch specified in the
   * configuration.
   */
  if (configBranch === branch && branch === mergeTargetBranch) {
    /*
     * We'll regularly receive webhook calls whenever a pull/merge request is opened, not just
     * merged/closed.
     */
    if (requestMerged) {
      /*
       * We might receive "real" (non-bot) pull requests for files other than Staticman-processed
       * comments. Ignore these by filtering on Staticman-created merge request branches.
       */
      if (reviewBranch.indexOf('staticman_') > -1) {
        await _notifyMailingList(reviewBody, staticman, ua).catch((error) => {
          if (error.message) {
            errors.push(error.message)
          } else {
            errors.push(JSON.stringify(error))
          }
        })

        /*
         * Deleting the merge request branch is only necessary for GitHub, as GitLab automatically
         * deletes it upon merging.
         */
        if (service === 'github') {
          const gitService = await _buildGitService(params, service, data, configBranch, mergeTargetBranch).catch((error) => {
            errors.push(error)
            return Promise.reject(errors)
          })

          await _deleteMergeRequestBranch(gitService, reviewBranch, ua).catch((error) => {
            errors.push(error)
          })
        }
      } else {
        // This is a valid condition, so don't put in errors array.
        console.log(`Request #${mergeReqNbr} not Staticman-generated - reviewBranch = ${reviewBranch}`)
        return Promise.reject(new Error('Request #' + mergeReqNbr + ' not Staticman-generated. Ignoring.'))
      }
    } else {
      // This is a valid condition, so don't put in errors array.
      console.log(`Request #${mergeReqNbr} not merged`)
      return Promise.reject(new Error('Request #' + mergeReqNbr + ' not merged. Ignoring.'))
    }
  } else {
    // This is a valid condition, so don't put in errors array.
    console.log(`Merge branch mismatch for pull/merge request #${mergeReqNbr} - configBranch = ${configBranch}, mergeTargetBranch = ${mergeTargetBranch}, paramsBranch = ${branch}`)
    return Promise.reject(new Error('Merge branch mismatch. Ignoring pull/merge request #' + mergeReqNbr))
  }

  if (errors.length > 0) {
    return Promise.reject(errors)
  }
}

const _buildGitService = async function (params, service, data, configBranch, webhookBranch) {
  const version = params.version
  let username = params.username
  let repository = params.repository
  let branch = params.branch

  if (service === 'github') {
    /*
     * In v1 of the endpoint, the service, username, repository, and branch parameters were
     * omitted. As such, if not provided in the webhook request URL, pull them from the webhook
     * payload.
     */
    if (username === null || typeof username === 'undefined') {
      username = data.repository.owner.login
    }
    if (repository === null || typeof repository === 'undefined') {
      repository = data.repository.name
    }
    if (branch === null || typeof branch === 'undefined') {
      branch = data.pull_request.base.ref
    }
  }

  const gitService = await gitFactory.create(service, {
    version: version,
    username: username,
    repository: repository,
    branch: branch
  })

  return gitService
}

const _notifyMailingList = async function (reviewBody, staticman, ua) {
  /*
   * The "staticman_notification" comment section of the pull/merge request comment only
   * exists if notifications were enabled at the time the pull/merge request was created.
   */
  const bodyMatch = reviewBody.match(/(?:.*?)<!--staticman_notification:(.+?)-->(?:.*?)/i)
  if (bodyMatch && (bodyMatch.length === 2)) {
    try {
      const parsedBody = JSON.parse(bodyMatch[1])
      if (staticman === null) {
        staticman = await new Staticman(parsedBody.parameters)
        staticman.setConfigPath(parsedBody.configPath)
      }

      await staticman.processMerge(parsedBody.fields, parsedBody.extendedFields, parsedBody.options).then(msg => {
        if (ua) {
          ua.event('Hooks', 'Create/notify mailing list').send()
        }
      })
    } catch (err) {
      if (ua) {
        ua.event('Hooks', 'Create/notify mailing list error').send()
      }

      return Promise.reject(err)
    }
  }
}

const _deleteMergeRequestBranch = async function (gitService, reviewBranch, ua) {
  try {
    // This will throw the error 'Reference does not exist' if the branch has already been deleted.
    await gitService.deleteBranch(reviewBranch)
    if (ua) {
      ua.event('Hooks', 'Delete branch').send()
    }
  } catch (err) {
    if (ua) {
      ua.event('Hooks', 'Delete branch error').send()
    }

    const msg = `Failed to delete merge branch ${reviewBranch} - ${err}`
    console.error(msg)
    return Promise.reject(msg)
  }
}
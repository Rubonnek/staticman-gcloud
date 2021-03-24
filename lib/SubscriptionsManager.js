'use strict'

const config = require('../config')
const md5 = require('md5')
const Confirmation = require('./Confirmation')
const Notification = require('./Notification')

const SubscriptionsManager = function (parameters, dataStore, mailAgent) {
  this.parameters = parameters
  this.dataStore = dataStore
  this.mailAgent = mailAgent

  this.listAddressParams = {
    username: parameters.username,
    repository: parameters.repository,
    mailAgent: mailAgent
  }
}

SubscriptionsManager.prototype.send = function (entryId, fields, extendedFields, options, siteConfig) {
  return _get(entryId, this.listAddressParams).then(listAddress => {
    if (listAddress !== null) {
      let emailFieldName = 'email'
      if (options.emailField) {
        emailFieldName = options.emailField
      }
      /*
       * Only send a notification email if the commenter is NOT the only subscriber found in the
       * mailing list. This avoids the clumsy scenario where someone makes the first comment on a
       * post (while choosing to subscribe to future comments) and then is sent a notification
       * email for their own comment.
       *
       * However, this will NOT preclude the commenter from receiving notification emails for
       * their own comments if there are MULTIPLE subscribers.
       */
      return _calcIsCommenterNotOnlySubscriber(listAddress, fields[emailFieldName], this.mailAgent).then((result) => {
        if (result === true) {
          const notifications = new Notification(this.mailAgent)

          return notifications.send(listAddress, fields, extendedFields, options, {
            siteName: siteConfig.get('name')
          })
        } else {
          /*
           * Don't send an email to notify the commenter of their own comment.
           */
          const msg = 'Commenter is the only subscriber. Suppressing notification.'
          console.log(msg)
          return msg
        }
      })
    } else {
      /*
       * The non-existence of the mailing list may or may not be error-worthy. To be safe, raise an
       * error and allow the caller to decide.
       */
      const msg = `Unable to find mailing list for ${entryId}`
      console.log(msg)
      return Promise.reject(new Error(msg))
    }
  })
}

/**
 * Send an email to obtain a confirmation that a user wants to subscribe to notification emails
 * sent whenever new comments are added (to a post, parent comment, etc.). If the given email
 * address is already subscribed, the email will not be sent.
 * @param toEmailAddress {String} - The email address to send the confirmation email to.
 * @param fields {Object} - Simple mapping of "fields" key-value pairs gathered when the
 *  triggering comment was submitted, moderately processed. Mostly contains data provided by the
 *  commenter, including the comment, comment author, and commenter email address (hashed).
 *  However, any Staticman-generated comment date ends up in here, too.
 * @param extendedFields {Object} - Simple mapping of key-value pairs generated when the triggering
 *  comment was submitted, fully processed. In addition to the data found in the "fields"
 *  parameter, also includes the Staticman-generated comment ID.
 * @param options {Object} - Simple mapping of "options" key-value pairs gathered when the
 *  triggering comment was submitted. Mostly metadata, including the origin site, ID of the
 *  comment's parent, etc.
 * @param siteConfig {Object} - Staticman configuration data.
 * @return {Promise} - resolvable to the result of attempting to send the email or an indication
 *  that the email was supressed.
 */
SubscriptionsManager.prototype.sendConfirm = function (toEmailAddress, fields, extendedFields, options, siteConfig) {
  const entryId = options.parent

  return _get(entryId, this.listAddressParams).then(list => {
    return _determineIfConfirmNeeded(toEmailAddress, list, entryId, this.listAddressParams).then(isConfirmNeeded => {
      if (isConfirmNeeded === true) {
        const confirmation = new Confirmation(this.mailAgent)

        const result = confirmation.send(toEmailAddress, fields, extendedFields, options, {
          siteName: siteConfig.get('name')
        })
        return result
      } else {
        /*
         * Don't send an email to confirm the commenter's subscription.
         */
        const msg = `${toEmailAddress} already subscribed to ${entryId}. Suppressing confirmation.`
        console.log(msg)
        return msg
      }
    })
  })
}

SubscriptionsManager.prototype.set = function (data, email, siteConfig) {
  const entryId = data.parent

  return new Promise((resolve, reject) => {
    let queue = []

    return _get(entryId, this.listAddressParams).then(list => {
      const listAddress = _getListAddress(entryId, this.listAddressParams)
      if (!list) {
        queue.push(new Promise((resolve, reject) => {
          let payload = {
            address: listAddress
          }
          /*
           * Only allow authenticated users to post to the list. This is the default, but let's
           * explicitly set it in case the default changes.
           */
          payload.access_level = 'readonly'

          /*
           * Restricting replies to "sender" (as opposed to all members of the list) would seem
           * to be the safest and most appropriate option for a list meant to receive
           * notifications.
           */
          payload.reply_preference = 'sender'

          const entryName = data.parentName
          if (typeof entryName !== 'undefined') {
            const exeEnv = config.get('exeEnv')
            const exeEnvProd = config.get('exeEnvProduction')

            /*
             * Set a name and description on the created list to aid in identification and
             * troubleshooting, as the automatically-generated list address is an obfuscated
             * hash value.
             */
            payload.name = entryName
            if (exeEnv && (exeEnv !== exeEnvProd)) {
              // Identify the source environment to flag/prevent cross-talk between environments.
              payload.name = exeEnv + ' - ' + payload.name
            }

            /*
             * For the description, include the elements that are used to generate the list
             * address hash value.
             */
            payload.description = 'Subscribers to ' + entryId +
              ' (' + this.parameters.username + '/' + this.parameters.repository + ')'
            if (exeEnv && (exeEnv !== exeEnvProd)) {
              // Identify the source environment to flag/prevent cross-talk between environments.
              payload.description = exeEnv + ' - ' + payload.description
            }
          }

          this.mailAgent.lists().create(payload, (err, result) => {
            if (err) return reject(err)

            return resolve(result)
          })
        }))
      }

      return Promise.all(queue).then(() => {
        let payload = {
          address: email
        }

        const consentModel = siteConfig.get('notifications.consentModel')
        /*
         * If an email consent model is configured, record audit fields along with the
         * subscriber's entry in the mailing list.
         */
        if (consentModel === 'single') {
          // Record single opt-in ("consent") audit fields.
          payload.vars = Object.assign({}, Confirmation.buildConsentData(data))
        } else if (consentModel === 'double') {
          /*
           * Record BOTH single opt-in ("consent") audit fields AND double opt-in ("confirm")
           * audit fields.
           */
          payload.vars = Object.assign({}, Confirmation.buildConsentData(data))

          payload.vars.subscribeConfirmDate = Math.floor(new Date().getTime() / 1000)
          payload.vars.subscribeConfirmContext = data.subscribeConfirmContext
          payload.vars.subscribeConfirmText = data.subscribeConfirmText
        }

        this.mailAgent.lists(listAddress).members().create(payload, (err, result) => {
          // A 400 is fine-ish, means the address already exists
          if (err && (err.statusCode !== 400)) return reject(err)

          return resolve(result)
        })
      })
    }).catch(error => {
      reject(error)
    })
  })
}

module.exports = SubscriptionsManager

const _getListAddress = function (entryId, listAddressParams) {
  const exeEnv = config.get('exeEnv')
  let compoundId = md5(`${exeEnv}-${listAddressParams.username}-${listAddressParams.repository}-${entryId}`)
  if (exeEnv) {
    // Identify the source environment to flag/prevent cross-talk between environments.
    compoundId = exeEnv + '-' + compoundId
  }

  return `${compoundId}@${listAddressParams.mailAgent.domain}`
}

const _get = function (entryId, listAddressParams) {
  const mailAgent = listAddressParams.mailAgent
  const listAddress = _getListAddress(entryId, listAddressParams)

  return new Promise((resolve, reject) => {
    mailAgent.lists(listAddress).info((err, value) => {
      if (err && (err.statusCode !== 404)) {
        return reject(err)
      }

      if (err || !value || !value.list) {
        return resolve(null)
      }

      return resolve(listAddress)
    })
  })
}

/**
 * Return true if the commenter (as identified by the given hash of their email address) is NOT
 * the only subscriber in the identified mailing list, else false. We have to use the hashed
 * email address because this can be invoked as part of merging in a comment, when the unhashed
 * email address is not available.
 */
const _calcIsCommenterNotOnlySubscriber = async function (listAddress, commenterEmailHashed, mailAgent) {
  return new Promise((resolve, reject) => {
    mailAgent.lists(listAddress).members().list((err, result) => {
      /*
       * By default, assume the posture that there are other interested parties that should be
       * notified.
       */
      let commenterIsNotOnlySubscriber = true

      if (err) {
        console.error(err)
        console.error('Error determining if commenter is not the only subscriber. Assuming not.')
      } else {
        try {
          /*
           * If there is more than one subscriber in the list, return true. Ignore the subtlety
           * that one or more people in the list might be "subscribed: false".
           */
          if (result.total_count === 1) {
            const onlySubscriberEmail = result.items[0].address
            /*
             * The email addresses in the mailing list are maintained in the clear. Hash it so
             * that we can compare it for equality.
             */
            const onlySubscriberEmailHashed = md5(onlySubscriberEmail)
            if (onlySubscriberEmailHashed === commenterEmailHashed) {
              commenterIsNotOnlySubscriber = false
            }
          }
        } catch (error) {
          console.error(error)
          console.error('Error determining if commenter is not the only subscriber. Assuming not.')
        }
      }

      return resolve(commenterIsNotOnlySubscriber)
    })
  })
}

const _determineIfConfirmNeeded = function (toEmailAddress, list, entryId, listAddressParams) {
  const mailAgent = listAddressParams.mailAgent
  return new Promise(async (resolve, reject) => {
    // By default, assume that a confirmation email should be sent.
    let isConfirmNeeded = true
    if (list) {
      const listAddress = _getListAddress(entryId, listAddressParams)
      await mailAgent.lists(listAddress).members(toEmailAddress).info((err, result) => {
        if (err) {
          /*
           * If the member is not found in the mailing list, an error will be raised. Seems a
           * bit clumsy.
           */
          console.error(`${toEmailAddress} not found in mailing list for ${entryId} (or error raised). Sending confirmation.`)
        } else {
          // Found the context commenter in the mailing list.
          try {
            if (result.member.subscribed) {
              /*
               * If the context commenter is already included in the mailing list and marked as
               * subscribed, there is no need to get another confirmation from them.
               */
              isConfirmNeeded = false
            }
          } catch (error) {
            console.error(error)
            console.error(`Error determining if ${toEmailAddress} already subscribed to ${entryId}. Assuming not.`)
          }
        }

        return resolve(isConfirmNeeded)
      })
    } else {
      /*
       * If a mailing list doesn't exist for the parent, nobody is subscribed, including the
       * context commenter. Confirmation is needed.
       */
      return resolve(isConfirmNeeded)
    }
  })
}

'use strict'

const md5 = require('md5')
const Notification = require('./Notification')

const SubscriptionsManager = function (parameters, dataStore, mailAgent) {
  this.parameters = parameters
  this.dataStore = dataStore
  this.mailAgent = mailAgent
}

SubscriptionsManager.prototype._getListAddress = function (entryId) {
  const compoundId = md5(`${this.parameters.username}-${this.parameters.repository}-${entryId}`)

  return `${compoundId}@${this.mailAgent.domain}`
}

SubscriptionsManager.prototype._get = function (entryId) {
  const listAddress = this._getListAddress(entryId)

  return new Promise((resolve, reject) => {
    this.mailAgent.lists(listAddress).info((err, value) => {
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
 * the only subscriber in the identified mailing list, else false.
 */
SubscriptionsManager.prototype._calcIsCommenterNotOnlySubscriber = async function (listAddress, commenterEmailHashed) {
  return new Promise((resolve, reject) => {
    this.mailAgent.lists(listAddress).members().list((err, result) => {
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

SubscriptionsManager.prototype.send = function (entryId, fields, extendedFields, options, siteConfig) {
  return this._get(entryId).then(listAddress => {
    if (listAddress) {
      /*
       * Only send a notification email if the commenter is NOT the only subscriber found in the
       * mailing list. This avoids the clumsy scenario where someone makes the first comment on a
       * post (while choosing to subscribe to future comments) and then is sent a notification
       * email for their own comment.
       */
      return this._calcIsCommenterNotOnlySubscriber(listAddress, fields.email).then((result) => {
        if (result === true) {
          const notifications = new Notification(this.mailAgent)

          return notifications.send(listAddress, fields, extendedFields, options, {
            siteName: siteConfig.get('name')
          })
        } else {
          /*
           * Don't send an email to notify the commenter of their own comment.
           */
          console.log('Commenter is the only subscriber. Suppressing notification.')
        }
      })
    }
  })
}

SubscriptionsManager.prototype.set = function (options, email) {
  const entryId = options.parent
  const listAddress = this._getListAddress(entryId)

  return new Promise((resolve, reject) => {
    let queue = []

    return this._get(entryId).then(list => {
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

          const entryName = options.parentName
          if (typeof entryName !== 'undefined') {
            /*
             * Set a name and description on the created list to aid in identification and
             * troubleshooting, as the automatically-generated list address is an obfuscated
             * hash value.
             */
            payload.name = entryName
            /*
             * For the description, include the elements that are used to generate the list 
             * address hash value.
             */
            payload.description = 'Subscribers to ' + entryId +
              ' (' + this.parameters.username + '/' + this.parameters.repository + ')'
          }

          this.mailAgent.lists().create(payload, (err, result) => {
            if (err) return reject(err)

            return resolve(result)
          })
        }))
      }

      return Promise.all(queue).then(() => {
        this.mailAgent.lists(listAddress).members().create({
          address: email
        }, (err, result) => {
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

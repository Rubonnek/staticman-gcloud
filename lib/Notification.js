'use strict'

const fs = require('fs')
const path = require('path')
const util = require('util')
const config = require(path.join(__dirname, '/../config'))
const nunjucks = require('nunjucks')

const readFileAsync = util.promisify(fs.readFile)

const Notification = function (mailAgent) {
  this.mailAgent = mailAgent
}

Notification.prototype._buildSubject = async function (fields, extendedFields, options, data) {
  const templateContent = await this._loadEmailTemplate('subject',
    `There is a new comment at {{ data.siteName }}`)
  const subject = nunjucks.renderString(templateContent, {
    fields: fields,
    extendedFields: extendedFields,
    options: options,
    data: data
  })
  return subject
}

Notification.prototype._buildMessage = async function (fields, extendedFields, options, data) {
  const templateContent = await this._loadEmailTemplate('content', `
    <html>
      <body>
        <h2>There is a new comment at <a href="{{ options.origin }}">{{ options.origin }}</a>.</h2>
        <br>
        If you prefer, you may <a href="%mailing_list_unsubscribe_url%">unsubscribe</a> from future emails.<br>
        <br>
      </body>
    </html>
    `
  )
  const emailContent = nunjucks.renderString(templateContent, {
    fields: fields,
    extendedFields: extendedFields,
    options: options,
    data: data
  })
  return emailContent
}

Notification.prototype._loadEmailTemplate = async function (subjectOrContent, defaultResult) {
  let templateContent = null
  try {
    /*
     * Expect a Nunjucks template file to be found at the root of the codebase, available for
     * customization.
     */
    templateContent = await readFileAsync(
      path.join(__dirname, '/../email-notification-' + subjectOrContent + '.njk'), {
        encoding: 'utf8'
      })
  } catch (error) {
    console.error(error)
    console.error('Sending notification email using default ' + subjectOrContent + '.')

    templateContent = defaultResult
  }
  return templateContent
}

/**
 * Send an email to the identified mailing list to notify the list member(s) that a new comment
 * has been posted.
 * @param to {String} - The address/ID of the mailing list to be targeted.
 * @param fields {Object} - Simple mapping of "fields" key-value pairs gathered when the comment
 *  was submitted, moderately processed. Mostly contains data provided by the commenter,
 *  including the comment, comment author, and commenter email address (hashed). However, any
 *  Staticman-generated comment date ends up in here, too.
 * @param extendedFields {Object} - Simple mapping of key-value pairs generated when the comment
 *  was submitted, fully processed. In addition to the data found in the "fields" parameter, also
 *  includes the Staticman-generated comment ID.
 * @param options {Object} - Simple mapping of "options" key-value pairs gathered when the comment
 *  was submitted. Mostly metadata, including the origin site, ID of the comment's parent, etc.
 * @param data {Object} - Simple mapping of key-value pairs containing any other pertinent data,
 *  such as configuration parameters.
 * return {Promise} - provided as part of submitting to the mailing list agent.
 */
Notification.prototype.send = function (to, fields, extendedFields, options, data) {
  return new Promise(async (resolve, reject) => {
    let payload = {
      from: `${config.get('email.fromName')} <${config.get('email.fromAddress')}>`,
      to
    }

    payload.subject = await this._buildSubject(fields, extendedFields, options, data)
    payload.html = await this._buildMessage(fields, extendedFields, options, data)

    /*
     * If we set the "reply_preference" property on the Mailgun mailing list to "sender" (which
     * seems to be the safest and most appropriate option for a list meant to receive
     * notifications), the "reply-to" of every email sent via the mailing list will be
     * postmaster@[mailgun domain] instead of the "from" address set above. Defeat this by
     * explicitly setting the "h:Reply-To" header.
     */
    payload['h:Reply-To'] = payload.from

    this.mailAgent.messages().send(payload, (err, res) => {
      if (err) {
        console.error(err)
        return reject(err)
      }

      return resolve(res)
    })
  })
}

module.exports = Notification

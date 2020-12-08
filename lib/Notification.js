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
 * return {Promise} - resolvable to the result of attempting to send the email.
 */
Notification.prototype.send = function (to, fields, extendedFields, options, data) {
  return new Promise(async (resolve, reject) => {
    let payload = {
      from: `${config.get('email.fromName')} <${config.get('email.fromAddress')}>`,
      to
    }

    payload.subject = await _buildSubject(fields, extendedFields, options, data)
    payload.html = await _buildMessage(fields, extendedFields, options, data)

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

const _buildSubject = async function (fields, extendedFields, options, data) {
  let subject = null
  try {
    const templateContent = await _loadEmailTemplate('subject')
    subject = nunjucks.renderString(templateContent, {
      fields: fields,
      extendedFields: extendedFields,
      options: options,
      data: data
    })

    if (subject.trim() === '') {
      throw new Error(`The rendered notification email subject is empty.`)
    }
  } catch (error) {
    console.error(error)
    console.error(`Using default subject for notification email.`)
    subject = `There is a new comment at ${data.siteName}`
  }
  return subject
}

const _buildMessage = async function (fields, extendedFields, options, data) {
  let emailContent = null
  try {
    const templateContent = await _loadEmailTemplate('content')

    emailContent = nunjucks.renderString(templateContent, {
      fields: fields,
      extendedFields: extendedFields,
      options: options,
      data: data
    })

    if (emailContent.trim() === '') {
      throw new Error(`The rendered notification email content is empty.`)
    }
  } catch (error) {
    console.error(error)
    console.error(`Using default content for notification email.`)

    emailContent = `
    <html>
      <body>
        There is a new comment at <a href="${options.origin}">${options.origin}</a>.
        <br>
        <br>
        If you prefer, you may <a href="%mailing_list_unsubscribe_url%">unsubscribe</a> from future emails.<br>
        <br>
      </body>
    </html>
    `
  }
  return emailContent
}

const _loadEmailTemplate = async function (subjectOrContent) {
  /*
   * Expect a Nunjucks template file to be found at the root of the codebase, available for
   * customization.
   */
  const templateContent = await readFileAsync(
    path.join(__dirname, '/../email-notification-' + subjectOrContent + '.njk'), {
      encoding: 'utf8'
    }
  )

  if (templateContent === null || templateContent.trim() === '') {
    throw new Error(`Contents of the loaded notification email ${subjectOrContent} template are empty.`)
  } else {
    return templateContent
  }
}

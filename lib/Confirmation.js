'use strict'

const fs = require('fs')
const path = require('path')
const util = require('util')
const config = require(path.join(__dirname, '/../config'))
const RSA = require(path.join(__dirname, '/../lib/RSA'))
const nunjucks = require('nunjucks')

const readFileAsync = util.promisify(fs.readFile)

const confirmTextDelimiterStart = '<!--confirmTextStart-->'
const confirmTextDelimiterEnd = '<!--confirmTextEnd-->'

const Confirmation = function (mailAgent) {
  this.mailAgent = mailAgent
}

/**
 * Send an email to the given recipient to confirm that they want to subscribe to comments.
 * @param toEmailAddress {String} - The email address of the potential subscriber.
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
 * return {Promise} - resolvable to the result of attempting to send the email
 */
Confirmation.prototype.send = function (toEmailAddress, fields, extendedFields, options, data) {
  return new Promise(async (resolve, reject) => {
    let payload = {
      from: `${config.get('email.fromName')} <${config.get('email.fromAddress')}>`,
      to: toEmailAddress
    }

    payload.subject = await _buildSubject(
      toEmailAddress, fields, extendedFields, options, data)
    payload.html = await _buildMessage(
      toEmailAddress, fields, extendedFields, options, data, payload.subject)

    const exeEnv = config.get('exeEnv')
    const exeEnvProd = config.get('exeEnvProduction')
    if (exeEnv && (exeEnv !== exeEnvProd)) {
      // Identify the source environment to flag/prevent cross-talk between environments.
      payload.from = exeEnv + ' - ' + payload.from
      payload.subject = exeEnv + ' - ' + payload.subject
    }

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

/**
 * Return an object containing single opt-in ("consent") audit fields using the given "raw"
 * options metadata. Intentionally implemented as a "static" function so it can be accessed
 * without instantiating a Confirmation.
 * @param options {Object} - Simple mapping of "options" key-value pairs (assumed to have been
 *  gathered when a comment was submitted. Assumed to contain the consent URL
 *  (subscribeConsentUrl), context (subscribeConsentContext), and text (subscribeConsentText).
 *  May also contain a consent date (subscribeConsentDate) if obtained earlier.
 *  If subscribeConsentUrl not supplied, origin will be used. If subscribeConsentContext not
 *  supplied, parentName will be used.
 * return {Object}
 */
Confirmation.buildConsentData = function (options) {
  return _buildConsentData(options)
}

module.exports = Confirmation

const _buildSubject = async function (toEmailAddress, fields, extendedFields, options, data) {
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
      throw new Error(`The rendered confirmation email subject is empty.`)
    }
  } catch (error) {
    console.error(error)
    console.error(`Using default subject for confirmation email.`)
    subject = `Please confirm your subscription to ${data.siteName}`
  }
  return subject
}

const _buildMessage = async function (toEmailAddress, fields, extendedFields, options, data, emailSubject) {
  let emailContent = null
  try {
    const templateContent = await _loadEmailTemplate('content')
    const confirmLink = _buildConfirmationLink(templateContent, toEmailAddress, fields, options, emailSubject)

    emailContent = nunjucks.renderString(templateContent, {
      fields: fields,
      extendedFields: extendedFields,
      options: options,
      data: data,
      confirmLink: confirmLink
    })

    if (emailContent.trim() === '') {
      throw new Error(`The rendered confirmation email content is empty.`)
    }
  } catch (error) {
    console.error(error)
    console.error(`Using default content for confirmation email.`)

    const confirmTextMarkup = `
        <!--confirmTextStart-->Please confirm your subscription request by clicking this link:<!--confirmTextEnd-->
    `
    const confirmLink = _buildConfirmationLink(confirmTextMarkup, toEmailAddress, fields, options, emailSubject)
    const confirmLinkShort = confirmLink.substring(0, 100)
    emailContent = `
    <html>
      <body>
        You have requested to be notified every time a new comment is added to <a href="${options.origin}">${options.origin}</a>.
        <br>
        <br>
        ${confirmTextMarkup} <a href="${confirmLink}">${confirmLinkShort}</a><br>
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
    path.join(__dirname, '/../email-confirmation-' + subjectOrContent + '.njk'), {
      encoding: 'utf8'
    }
  )

  if (templateContent === null || templateContent.trim() === '') {
    throw new Error(`Contents of the loaded confirmation email ${subjectOrContent} template are empty.`)
  } else {
    return templateContent
  }
}

const _buildConfirmationLink = function (templateContent, toEmailAddress, fields, options, emailSubject) {
  /*
   * The templateContent argument is expected to contain a portion that is delimited with
   * <!--confirmTextStart--> and <!--confirmTextEnd-->, which will be extracted to be used as the
   * confirmation text (audit field).
   */
  const idx1 = templateContent.indexOf(confirmTextDelimiterStart) + confirmTextDelimiterStart.length
  const idx2 = templateContent.indexOf(confirmTextDelimiterEnd)
  const confirmText = templateContent.substring(idx1, idx2)
  const encryptedText = _encryptConfirmationLink(toEmailAddress, fields, options, emailSubject, confirmText)

  /*
   * All of the data needed to process a subscription confirmation (aside from values contained in
   * the URL path such as repo, branch, etc.) are passed in the "data" querystring value. This is
   * a win from a privacy perspective, as we won't add them to a mailing list until they confirm.
   * It also prevents the mailing lists from getting filled-up with spam email addresses. When the
   * user clicks the link from the received confirmation email, logic in the targeted Staticman
   * endpoint will decrypt it and use the data to subscribe the user.
   */
  const confirmLink = options.subscribeConfirmUrl + '?data=' + encodeURIComponent(encryptedText)
  return confirmLink
}

const _encryptConfirmationLink = function (toEmailAddress, fields, options, emailSubject, confirmText) {
  let toEncrypt = {
    subscriberEmailAddress: toEmailAddress,
    parent: options.parent,
    parentName: options.parentName
  }
  Object.assign(toEncrypt, _buildConsentData(options))
  Object.assign(toEncrypt, {
    subscribeConfirmContext: 'Email "' + emailSubject.trim() + '"',
    subscribeConfirmText: confirmText,
    subscribeConfirmRedirect: options.subscribeConfirmRedirect,
    subscribeConfirmRedirectError: options.subscribeConfirmRedirectError
  })

  /*
   * Insert a pepper into the payload. More info - https://en.wikipedia.org/wiki/Pepper_(cryptography)
   * We do this because the "encrypt" endpoint is currently exposed for anyone to hit. As such, an
   * attacker could easily create their own valid encrypted strings and subscribe whoever they
   * want. They'd be able to see the expected structure of the payload data simply by looking at
   * the source code. Inserting a secret into the payload allows us to verify the authenticity of
   * the encrypted payload when it is submitted back.
   */
  toEncrypt.pepper = config.get('cryptoPepper')
  
  // Identify the source environment to flag/prevent cross-talk between environments.
  toEncrypt.exeEnv = config.get('exeEnv')

  const encryptedText = RSA.encrypt(JSON.stringify(toEncrypt))
  return encryptedText
}

const _buildConsentData = function (options) {
  let result = {
    subscribeConsentDate: Math.floor(new Date().getTime() / 1000),
    subscribeConsentUrl: options.subscribeConsentUrl,
    subscribeConsentContext: options.subscribeConsentContext,
    subscribeConsentText: options.subscribeConsentText
  }

  /*
   * If the given options contain a consent date, use that instead of the timestamp generated
   * by default (above). This is expected to be the case if double opt-in is enabled, in which
   * case the consent date would be set to be when the confirmation email was sent.
   */
  if (typeof options.subscribeConsentDate !== 'undefined' && options.subscribeConsentDate !== null) {
    result.subscribeConsentDate = options.subscribeConsentDate
  }

  /*
   * If the consent URL is not explicitly set, use the origin (the URL of the entry being
   * subscribed to).
   */
  if (result.subscribeConsentUrl === null || typeof result.subscribeConsentUrl === 'undefined') {
    // options.origin should contain the full URL of the entry being subscribed to.
    result.subscribeConsentUrl = options.origin
  }

  /*
   * If the consent context is not explicitly set, use the parent name (a human-readable
   * name/description of what is being subscribed to.)
   */
  if (result.subscribeConsentContext === null || typeof result.subscribeConsentContext === 'undefined') {
    /*
     * options.parentName should contain a human-readable name/description of what is being
     * subscribed to.
     */
    result.subscribeConsentContext = options.parentName
  }

  return result
}

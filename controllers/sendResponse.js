'use strict'

const { URL, URLSearchParams } = require('url')
const errorHandler = require('../lib/ErrorHandler')

/**
 * Module for "encoding" the result of a request into the Express response. It is possible for
 * the response (whether success or failure) to be communicated back via a redirect to a supplied
 * URL or in a direct response (most likely to an AJAX request).
 */
module.exports = (res, data) => {
  const error = data && data.err
  const statusCode = error ? 500 : 200

  /*
   * If there are any secondary errors that were raised during processing, communicate them
   * back in the response. These are errors that do not invalidate the result as being a
   * success, but they qualify as warnings that should possibly be displayed to the user.
   */
  const secondaryErrors = data.secondaryErrors

  if (!error && data.redirect) {
    const redirectUrl = new URL(data.redirect)

    if (secondaryErrors) {
      redirectUrl.search = new URLSearchParams(secondaryErrors)
    }

    return res.redirect(redirectUrl.toString())
  }

  if (error && data.redirectError) {
    return res.redirect(data.redirectError)
  }

  let payload = {
    success: !error
  }

  if (error && error._smErrorCode) {
    const errorCode = errorHandler.getInstance().getErrorCode(error._smErrorCode)
    const errorMessage = errorHandler.getInstance().getMessage(error._smErrorCode)

    if (errorMessage) {
      payload.message = errorMessage
    }

    if (error.data) {
      payload.data = error.data
    }

    if (error) {
      payload.rawError = error
    }

    payload.errorCode = errorCode
  } else if (error) {
    payload.rawError = data.err.toString()
  } else {
    payload.fields = data.fields
    if (secondaryErrors) {
      payload.secondaryErrors = secondaryErrors
    }
  }

  res.status(statusCode).send(payload)
}

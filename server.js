const bodyParser = require('body-parser')
const config = require('./config')
const express = require('express')
const ExpressBrute = require('express-brute')
const objectPath = require('object-path')

class StaticmanAPI {
  constructor () {
    this.controllers = {
      connect: require('./controllers/connect'),
      encrypt: require('./controllers/encrypt'),
      auth: require('./controllers/auth'),
      home: require('./controllers/home'),
      process: require('./controllers/process'),
      webhook: require('./controllers/webhook'),
      confirmSubscription: require('./controllers/confirmSubscription')
    }

    this.server = express()
    this.server.use(bodyParser.json())
    this.server.use(bodyParser.urlencoded({
      extended: true
      // type: '*'
    }))

    this.initialiseCORS()
    this.initialiseBruteforceProtection()
    this.initialiseRoutes()
  }

  initialiseBruteforceProtection () {
    const store = new ExpressBrute.MemoryStore()

    this.bruteforce = new ExpressBrute(store)
  }

  initialiseCORS () {
    this.server.use((req, res, next) => {
      // By default, return a value that allows all origins.
      let reqOrigin = '*'
      let originAllowed = true
      let proxyEnvAllowed = true

      /*
       * For example, /v3/confirm/gitlab/username/repo-name/dev/comments
       * We only want to "lock down" the "entry" endpoint, as that is the only endpoint called from
       * browser-rendered web pages.
       */
      const isEntryEndpoint = req.path.match(/^\/v\d\/entry\//)
      const allowedOrigins = config.get('origins')
      if (isEntryEndpoint && allowedOrigins !== null) {
        originAllowed = allowedOrigins.some(oneOrigin => {
          // Allow for regular expressions in the config. For example, http://localhost:.*
          return new RegExp(oneOrigin).test(req.headers.origin)
        })

        if (originAllowed) {
          reqOrigin = req.headers.origin
        } else {
          /*
           * Identify the proxy environment, if relevant, as an alternative check to the CORS
           * origin header. Initially added for IE v11, which does not send the origin request
           * header in same-origin POST requests.
           */
          const proxyEnvHeader = req.headers['x-proxy-env']
          const exeEnv = config.get('exeEnv')
          console.log('proxyEnvHeader = %o, exeEnv = %o', proxyEnvHeader, exeEnv)
          if (proxyEnvHeader && proxyEnvHeader !== exeEnv) {
            proxyEnvAllowed = false
          }
        }
      }

      if (originAllowed || proxyEnvAllowed) {
        res.setHeader('Access-Control-Allow-Origin', reqOrigin)
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
        return next()
      } else {
        /*
         * Abort processing of the request and return a 403 Forbidden. With this, we are taking
         * liberties with the CORS-centric origin header, as a CORS violation is really only
         * supposed to be acted upon by the user-agent, not the server. More info:
         * https://github.com/expressjs/cors/issues/109#issuecomment-289324022
         */
        return res.status(403).send({
          success: false
        })
      }
    })
  }

  initialiseRoutes () {
    // Route: connect
    this.server.get(
      '/v:version/connect/:username/:repository',
      this.bruteforce.prevent,
      this.requireApiVersion([1, 2]),
      this.controllers.connect
    )

    // Route: process
    this.server.post(
      '/v:version/entry/:username/:repository/:branch',
      this.bruteforce.prevent,
      this.requireApiVersion([1, 2]),
      this.requireParams(['fields']),
      this.controllers.process
    )

    this.server.post(
      '/v:version/entry/:username/:repository/:branch/:property',
      this.bruteforce.prevent,
      this.requireApiVersion([2]),
      this.requireParams(['fields']),
      this.controllers.process
    )

    this.server.post(
      '/v:version/entry/:service/:username/:repository/:branch/:property',
      this.bruteforce.prevent,
      this.requireApiVersion([3]),
      this.requireService(['github', 'gitlab']),
      this.requireParams(['fields']),
      this.controllers.process
    )

    // Route: encrypt
    this.server.get(
      '/v:version/encrypt/:text',
      this.bruteforce.prevent,
      this.requireApiVersion([2, 3]),
      this.controllers.encrypt
    )

    // Route: oauth
    this.server.get(
      '/v:version/auth/:service/:username/:repository/:branch/:property',
      this.bruteforce.prevent,
      this.requireApiVersion([2, 3]),
      this.requireService(['github', 'gitlab']),
      this.controllers.auth
    )

    this.server.post(
      /*
       * Make the service, username, repository, etc. parameters optional in order to
       * maintain backwards-compatibility with v1 of the endpoint, which assumed GitHub.
       */
      '/v:version/webhook/:service?/:username?/:repository?/:branch?/:property?',
      this.bruteforce.prevent,
      this.requireApiVersion([1, 3]),
      /*
       * Allow for the service to go unspecified in order to maintain backwards-compatibility
       * with v1 of the endpoint, which assumed GitHub.
       */
      this.requireService(['', 'github', 'gitlab']),
      this.controllers.webhook
    )

    this.server.get(
      '/v:version/confirm/:service/:username/:repository/:branch/:property',
      this.bruteforce.prevent,
      this.requireApiVersion([3]),
      this.requireService(['github', 'gitlab']),
      this.controllers.confirmSubscription
    )

    // Route: root
    this.server.get(
      '/',
      this.controllers.home
    )
  }

  requireApiVersion (versions) {
    return (req, res, next) => {
      const versionMatch = versions.some(version => {
        return version.toString() === req.params.version
      })

      if (!versionMatch) {
        return res.status(400).send({
          success: false,
          errorCode: 'INVALID_VERSION'
        })
      }

      return next()
    }
  }

  requireService (services) {
    return (req, res, next) => {
      const serviceMatch = services.some(service => {
        let requestedService = req.params.service
        if (typeof requestedService === 'undefined') {
          requestedService = ''
        }
        return service === requestedService
      })

      if (!serviceMatch) {
        return res.status(400).send({
          success: false,
          errorCode: 'INVALID_SERVICE'
        })
      }

      return next()
    }
  }

  requireParams (params) {
    return function (req, res, next) {
      let missingParams = []

      params.forEach(param => {
        if (
          objectPath.get(req.query, param) === undefined &&
          objectPath.get(req.body, param) === undefined
        ) {
          missingParams.push(param)
        }
      })

      if (missingParams.length) {
        return res.status(500).send({
          success: false,
          errorCode: 'MISSING_PARAMS',
          data: missingParams
        })
      }

      return next()
    }
  }

  start (callback) {
    this.instance = this.server.listen(config.get('port'), () => {
      if (typeof callback === 'function') {
        callback(config.get('port'))
      }
    })
  }

  close () {
    this.instance.close()
  }
}

module.exports = StaticmanAPI

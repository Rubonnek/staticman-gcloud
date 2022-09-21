const functions = require('@google-cloud/functions-framework')

// NOTE: The Google Cloud Functions framework creates it's own Express server
// under the hood that listens on port 80 and port 443 (when running in the
// cloud) or on port 8080 when running locally. Google's Express server object
// is not accessible by default.

// Since the StaticmanAPI also creates and configures its own Express server
// and the corresponding routes it expects, the easiest (and ugliest) way to
// make the StaticmanAPI work in tandem with Google's Express server is to have
// both run at the same time and simply have Google's server act like a reverse
// proxy to the StaticmanAPI.

// Thus, this is what we do here -- let's start the Staticman server:
const StaticmanAPI = require('./server')
const api = new StaticmanAPI()
var staticmanPort = 0
api.start(pPort => {
  staticmanPort = pPort
  if (staticmanPort === 80 || staticmanPort === 443 || staticmanPort === 8080) {
    throw new Error('Staticman port should not be 80 nor 443 nor 8080 to avoid conflicting with Google Cloud Functions Framework server!')
  }
})

// And now let's setup Google's server:

// NOTE: Redirecting GET requests is trivial, however redirecting the POST
// requests through the proxy will make the receiving server hang.
// The solution below was taken from: https://github.com/http-party/node-http-proxy/issues/180#issuecomment-191098037

var proxy = require('http-proxy').createProxyServer()
proxy.on('proxyReq', function (proxyReq, req, _res, _options) {
  if ((req.method === 'POST' || req.method === 'OPTIONS') && req.body) {
    proxyReq.write(req.body)
    proxyReq.end()
  }
})

function main (req, res) {
  if (req.method === 'GET') {
    proxy.web(req, res, {
      target: 'http://127.0.0.1:' + staticmanPort
    })
  } else if ((req.method === 'POST' || req.method === 'OPTIONS') && req.body) {
    var headers = {}
    var data = JSON.stringify(req.body)
    req.body = data
    headers = {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
    proxy.web(req, res, {
      target: 'http://127.0.0.1:' + staticmanPort,
      headers: headers
    })
  }
}

// Let's start Google's Express server:
functions.http('main', main)

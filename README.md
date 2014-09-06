[![Build Status](https://travis-ci.org/x-component/x-proxy.png?v0.0.1)](https://travis-ci.org/x-component/x-proxy)
=======================================================================================================



x-proxy
=======

This module provides helper functions to map urls from an external client representations to urls as used bay a backend server.
It also supports the reverse mapping back from urls of the backend server to external client urls.

The following diagram depicts a proxy mounting the backend server at the mount point '/xyz'

                 +---------+        +----------------------------------+
    client ----->|  proxy  |------->| target backend server            |
                 |  mount: |        | url:                             |
                 |  '/xyz' |        | http://server:8080/target/path   |
                 +---------+        +----------------------------------+

The extenral url /xyz/a?b=c seen by a client of the proxy, should thus be mapped to http://server:8080/target/path/a?b=c

Note: the external url representation takes care about x-forwarded-host headers etc.


    var proxy = require('x-proxy');

    var mount = '/xyz';
    var prx = req.proxy = proxy(req,{url:'http://server:8080/target/path'},mount);
    // prx now provide mapping functions within the context of this request and the given target url


** request / backend specific helpers: **

prx.internal( url )
-------------------
test if an url is part of the proxy backend server, thus an internal location, or is just link to some external location (false)
for internal locations a object is returned : {secure_switch:false} or {secure_switch:true}.
secure_switch indicates if it is an internal location but the protocoll is changed. p.e. to jump to a https version of the location

prx.url( url )
--------------
maps an url with mount of the server to an url in terms of the backend server

prx.reverse( url, with_http_server_port )
-----------------------------------------
maps an url of the backen server to an url for the client. Use with_http_server_port=true in case you need an absolute url. p.e. for lcoation headers.

prx.relativize( url )
---------------------
transforms an (absolute) backend server url to a extrnal valid relative url. This allows to rewrite html content to relattive urls, such they stay valid in a chain of proxies.

prx.resolve( relative_url , with_http_server_port )
---------------------------------------------------
relsolve a releative url to an external absolute url. Use with_http_server_port=true in case you need an absolute url with server and port.


** global helpers: **

proxy.relativize( base, path )
------------------------------
for a prefix and a an absolute path return a relative path: p.e. base:'/a/b/c/d', path:'/a/b/e',  result: '../e'

proxy.absolutize( req, relative_path, with_http_server_port )
-------------------------------------------------------------
return an absolute url for this request, optionally with protocol, server and port.

proxy.externalize( req, relative_url  )
---------------------------------------
create an absolute url suitable for a client browser, thus using host and x-forwarded host headerss

proxy.internalize( req, relative_url )
--------------------------------------
create an absolute url suitable for this server internally, NOT using x-forwarded-host etc.

proxy.secure( req )
-------------------
return an absolute secure version of the current request url for a client

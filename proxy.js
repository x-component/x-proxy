'use strict';


/*
 * x-proxy
 * =======
 *
 * This module provides helper functions to map urls from an external client representations to urls as used bay a backend server.
 * It also supports the reverse mapping back from urls of the backend server to external client urls.
 *
 * The following diagram depicts a proxy mounting the backend server at the mount point '/xyz'
 *
 *                  +---------+        +----------------------------------+
 *     client ----->|  proxy  |------->| target backend server            |
 *                  |  mount: |        | url:                             |
 *                  |  '/xyz' |        | http://server:8080/target/path   |
 *                  +---------+        +----------------------------------+
 *
 * The extenral url /xyz/a?b=c seen by a client of the proxy, should thus be mapped to http://server:8080/target/path/a?b=c
 *
 * Note: the external url representation takes care about x-forwarded-host headers etc.
 *
 *
 *     var proxy = require('x-proxy');
 *
 *     var mount = '/xyz';
 *     var prx = req.proxy = proxy(req,{url:'http://server:8080/target/path'},mount);
 *     // prx now provide mapping functions within the context of this request and the given target url
 *
 *
 * ** request / backend specific helpers: **
 *
 * prx.internal( url )
 * -------------------
 * test if an url is part of the proxy backend server, thus an internal location, or is just link to some external location (false)
 * for internal locations a object is returned : {secure_switch:false} or {secure_switch:true}.
 * secure_switch indicates if it is an internal location but the protocoll is changed. p.e. to jump to a https version of the location
 *
 * prx.url( url )
 * --------------
 * maps an url with mount of the server to an url in terms of the backend server
 *
 * prx.reverse( url, with_http_server_port )
 * -----------------------------------------
 * maps an url of the backen server to an url for the client. Use with_http_server_port=true in case you need an absolute url. p.e. for lcoation headers.
 *
 * prx.relativize( url )
 * ---------------------
 * transforms an (absolute) backend server url to a extrnal valid relative url. This allows to rewrite html content to relattive urls, such they stay valid in a chain of proxies.
 *
 * prx.resolve( relative_url , with_http_server_port )
 * ---------------------------------------------------
 * relsolve a releative url to an external absolute url. Use with_http_server_port=true in case you need an absolute url with server and port.
 *
 *
 * ** global helpers: **
 *
 * proxy.relativize( base, path )
 * ------------------------------
 * for a prefix and a an absolute path return a relative path: p.e. base:'/a/b/c/d', path:'/a/b/e',  result: '../e'
 *
 * proxy.absolutize( req, relative_path, with_http_server_port )
 * -------------------------------------------------------------
 * return an absolute url for this request, optionally with protocol, server and port.
 *
 * proxy.externalize( req, relative_url  )
 * ---------------------------------------
 * create an absolute url suitable for a client browser, thus using host and x-forwarded host headerss
 *
 * proxy.internalize( req, relative_url )
 * --------------------------------------
 * create an absolute url suitable for this server internally, NOT using x-forwarded-host etc.
 *
 * proxy.secure( req )
 * -------------------
 * return an absolute secure version of the current request url for a client
 */
var
	url        = require('url'),
	common     = require('x-common'),
	global_log = require('x-log'),
	extend     = common.extend;

/*!
 * helper function based on server config and current request
 * the current request can have proxy target configuration req.target , it constains the config of the proxy target p.e. the cms config
 * optionally the req can have a req.mount, which indicates the mount (path prefix) where the proxy target was mountet to
 * if no target is given the current server config is regarded as target.
 */
var M;
module.exports=extend(M=function(req,target_config,mount){
	var
		tmp,
		log           = req.log ? req.log(__filename) : {},
		
		server_config = req.server ? req.server.config : { hostname:'localhost' },
		headers       = req && req.headers ? req.headers : {},
		
		protocol      = headers.isssl || headers['x-isssl'] ? 'https' : ( headers['x-forwarded-proto'] || server_config.protocol  || 'http'  ),
		
		host          = (tmp=headers['x-forwarded-host']) && (tmp=tmp.trim().split(/[,\s]+/)) ? tmp[0] : null, // split forwarded host so "m.x-x.io, proxy1:80808 prx2" -> returns m.x-x.io
		external_url  = protocol && host && (tmp=headers['x-x-forwarded-request']) ? protocol+'://'+ host + tmp : null,
		external      = external_url ? url.parse(external_url) : null, // url as seen by the client
		
		server_url    = protocol && (host=(headers.host||(server_config.hostname+(server_config.port?':'+server_config.port:'')))) ? (protocol + '://' + host ): null,
		server        = server_url ? url.parse(server_url) : null, // current server config but as seen from outside (host header etc.)
		
		target_url    = target_config ? target_config.url : null, // use the url config of the proxy target
		target        = target_url ? url.parse(target_url) : null;// backend config url, p.e. cms www.x-x.io/mobile-portal
		
	mount = mount ? ('/'+mount).replace(/[\/]{2,}/g,'/') : null; // begin with / and replace sequences of / with a single /
		
	if(mount && mount.length && mount[mount.length-1]==='/') mount=mount.substring(0,mount.length-1); // remove / at end
		
	return {
		/*!
		 * test if a an url is internal for that proxy target or is an external url . p.e. a jump out of the proxy target scope
		 * example: for a target config like http://www.x-x/mobile-portal
		 * the url http://www.x-x/home is external (as the path prefix is different)
		 * the url https://www.x-x/mobile-portal/tarife/shop  is not external, just a switch to http. note http is prefix of https.
		 *
		 * to be in the same scope server and port must be equal (default port numbers for http/https are respected)
		 * url protocol mus have proxy target protocol as prefix p.e. http
		 * url path must have proxy target path as prefix  p.e. /mobile-portal
		 *
		 * we return null for non intenral urls
		 * and an object for internal urls, where a property ssl indicates if its internal but a switch to or from ssl
		 */
		internal : function( u ){
			//debugger;
			var prefix = target || server; // note server protocol respects header isssl / x-forward-proto
			
			if( !u      ) return false;
			if( !prefix ) return {secure_switch:false};
			
			if( typeof u      === 'string' ) u      = url.parse(u     );   // came back from proxy target p.e. cms
			if( typeof prefix === 'string' ) prefix = url.parse(prefix);   // backend config url, p.e. cms www.x-x.io/mobile-portal
			
			if( protocol ) prefix = extend({},prefix,{protocol:protocol+':'}); // we assume https for backend if server is called with x-isssl:true for this test
			
			// prefix protocol must be prefix of test protocoll. (so http is prefix of https, this works as the s at the end is a common convention
			// semantically it means that a switch to https is not an 'external' jump, https:// is a subset within the http:// domain.
			var secure_switch=false;
			if( prefix.protocol && u.protocol ){
				var
					prefix_protocol = prefix.protocol.split(':')[0], // remove :// or : at the end
					     u_protocol =      u.protocol.split(':')[0], // remove :// or : at the end
					prefix_protocol_length = prefix_protocol.length,
					     u_protocol_length =      u_protocol.length;
					
				secure_switch = ( u_protocol_length > prefix_protocol_length && u_protocol.substring(prefix_protocol_length).charAt(0)==='s'
				               || u_protocol_length < prefix_protocol_length && prefix_protocol.substring(u_protocol_length).charAt(0)==='s'
				                );
				
				if( !secure_switch && ( u_protocol !== prefix_protocol ) ) return false;
			}
			
			if( prefix.hostname && u.hostname && prefix.hostname !== u.hostname) return false;
			
			if( prefix.port || u.port ){
				
				var prefix_port = prefix.port || ( /^http/.test(prefix.protocol) ? ( prefix.protocol.charAt(4)==='s' ? 443 : 80 ) : void 0);
				var      u_port =      u.port || ( /^http/.test(     u.protocol) ? (      u.protocol.charAt(4)==='s' ? 443 : 80 ) : void 0);
				
				if( !secure_switch & prefix_port != u_port ) return false; /*! note: != not !== !! */ // jshint ignore:line
			}
			
			if( prefix.pathname && u.pathname && u.pathname.substring(0,prefix.pathname.length)!==prefix.pathname ) return false;
			
			return {secure_switch:secure_switch};
		},
		
		/*!
		 * map a proxy server url to an url as expected by the proxy target
		 * example:
		 * mount is '/mountpath/x' and target is http://www.x-x.io/mobile-portal
		 * then map current url '/mountpath/x/abc?x=1&y=2' to proxy target url /mobile-portal/abc?x=1&y=2
		 */
		url:function( u, with_http_server_port, with_assumed_external_protocol ){
			
			var is_str = typeof u === 'string';
			
			if( is_str ) u = url.parse(u);
			
			var pathname = u.pathname || '';
			
			// remove mount
			if ( mount && mount === pathname.substring(0,mount.length) ){
				pathname = pathname.substring(mount.length);
			}
			
			// add prefix
			if( target && target.pathname ){
				pathname = target.pathname + (pathname ? '/' + pathname:'');
			}
			
			// replace a sequence of multiple / by a single /
			pathname = pathname.replace(/[\/]{2,}/g,'/');
			
			var new_u = {
				pathname : pathname,  // <---  rewritten
				search   : u.search,
				hash     : u.hash
			};
			
			if( with_http_server_port ){
				var goal = target || server ; // use this server if it was just a mount but there is no other external target
				extend( new_u, {
					hostname : goal.hostname,
					port     : goal.port,
					protocol : with_assumed_external_protocol && protocol ? protocol : goal.protocol
				});
			}
			
			return is_str ? url.format(new_u) : new_u;
		},
		/*!
		 * map a proxy target url to an url as expected by the proxy server
		 * example:
		 * mount is '/mountpath/x' and target is http://www.x-x.io/mobile-portal
		 * map proxy target url  https://www.x-x.io/mobile-portal/foo/bar;session=XYZ?f=1&b=2
		 * to proxy server url   https://servername:serverport/mountpath/x/foo/bar;session=ABC?f=1&b=2
		 * where ABC is the external session id
		 */
		reverse: extend(function F( u, with_http_server_port ){
			var
				tmp,
				is_str = typeof u === 'string',
				orig_u = u;
			
			if( is_str ) u = url.parse(u);
			
			var internal = this.internal( u );
			
			if ( !internal ) return orig_u;  // only internal URL's are reverse rewritten. Note: a switch to https is internal
			
			if( internal.secure_switch && with_http_server_port !== false ) {
				
				if ( external ) {
					var current_url = this.url( req.url, true );
					return F.externalize(current_url,u); // return an absolute external url
				}
				
				// no proxy in front of us detected, so make it at least absolute:
				with_http_server_port = true;
			}
			
			var
				pathname            = u.pathname,
				//remove the automatically added single slash by url.parse (if there is no path in the configured backend)
				target_pathname     = target ? (target.pathname === '/' ? '' : target.pathname) : null;
			
			// remove target prefix
			if( pathname && target_pathname && pathname.substring(0,target_pathname.length)===target_pathname ) {
				pathname = pathname.substring(target_pathname.length);
			}
			
			if(mount) {
				pathname = mount + ( pathname ? pathname : '');
			}
			// replace a sequence of multiple / by a single /
			pathname = pathname.replace(/[\/]{2,}/g,'/');
			
			var new_u = {
				pathname : pathname, // <--- reverse rewritten
				search   : u.search,
				hash     : u.hash
			};
			
			if( with_http_server_port ){
				var
					goal          = server, // use always this server
					goal_protocol = goal.protocol.split(':')[0],
					goal_port     = goal.port;
				
				if( internal.secure_switch ){
					var
						secure         = goal_protocol && goal_protocol[goal_protocol.length-1] === 's',
						http_port      = server_config && server_config && server_config.port ? server_config.port : 80,
						https_port     = server_config && server_config.https && server_config.https.port ? server_config.https.port : 443,
						compare_port   = goal_port ? goal_port : (secure ? 443 : 80),
						is_http_port   = !secure && compare_port == http_port,  /*! explicit == */ // jshint ignore:line
						is_https_port  = secure  && compare_port == https_port, /*! explicit == */ // jshint ignore:line
						detected_port  = is_http_port || is_https_port;
						goal_protocol  = secure? goal_protocol.substring(0,goal_protocol.length-1) : goal_protocol + 's';
					
					if(detected_port){
						if( is_http_port  ) goal_port = https_port === '443' ? '' : https_port;
						if( is_https_port ) goal_port = http_port  === '80'  ? '' : http_port;
					}
				}
				
				extend( new_u, {
					hostname : goal.hostname,
					port     : goal_port,
					protocol : goal_protocol + ':'
				});
			}
			
			return is_str ? url.format(new_u) : new_u;
		},{
			
			// helpers to handle the session in url pathname encoded session id's
			session : extend(function ( pathname ){
				var
					tmp,
					session = pathname && (tmp=( external ? external.pathname : pathname ).split(';')) && 1 in tmp ? (tmp.shift(),tmp.join(';')) : null; // everything after the first ;
				return session;
			},{
				strip: function( pathname ){
					var tmp;
					return pathname && (tmp=pathname.split(';')) ? tmp[0] : null;
				},
				add: function( pathname, session ){
					return session ? pathname + ';' + session : pathname;
				}
			}),
			
			/*!
			 * for a given target url we detected the external reversed version of it for the client, in front of all proxies
			 * this is thus a special case of a reverse rewrite. As the resulting url is such that intermediate proxies will not rewrite it
			 *
			 * as a security switch as a link/redirect to the redirect to the  https or to the http protokoll
			 * - within the page (link or html ajax response)
			 * - within a location header
			 *
			 */
			externalize: function( current_url, u ){
				// if a link is used to switch to a secure protocol or from a secure to an insecure one thus internal.secure_switch is true:
				// example: https://www.x-x.io/mobile-portal/foo , we can not use a relative link, and we can not use the server seettings if we are behind a proxy
				// in this case we need the forwarded external url to create a valid *absolute* link in *terms of the final client*
				// example
				// external_url http://m.x-x/blablubber/ping/bla/?x=1&x=2
				// current_url  http://www.x-x/mobile-portal/bla/?x=1&x=2
				// common postfix = /bla/?x=1&x=2
				// thus prefix of current to remove = http://www.x-x/mobile-portal
				// and the prefix we nee to add https://m.x-x/blablubber/ping , note https: not http because of switch
				// thus if u    https://www.x-x/mobile-portal/foo/bar?z=3
				// we get  https: + //m.x-x/blablubber/ping + /foo/bar?z=3
				
				// we need to handle te session extra: example wit session id's
				// http://m.x-x/blablubber/ping/bla;SESSION=S1?x=1&x=2   - - > external session = "SESSION=S1"
				// http://www.x-x/mobile-portal/bla;SESSION=S2?x=1&x=2 - - > current session = "SESSION=S2"
				// u can have a session too - - > we give priority for now for this session.
				// so the proxy target finally defines the session,
				// because it could return a for example new id on session timeout/invalidation
				
				//debugger;
				if(!external) return null;
				
				if( typeof u === 'string' ) u = url.parse(u);
				
				var
					current           = url.parse(current_url),
					
					session           = this.session(u.pathname),
					strip             = this.session.strip,
					pathname          = strip(u.pathname),
					current_pathname  = strip(current.pathname),
					external_pathname = strip(external.pathname),
					
					postfix           = common.postfix( current_pathname, external_pathname ),
					
					current_prefix  =   current_pathname.substring(0,  current_pathname.length-postfix.length),
					external_prefix =  external_pathname.substring(0, external_pathname.length-postfix.length);
				
				pathname = external_prefix + pathname.substring(current_prefix.length);
				
				if(session) pathname=this.session.add(pathname,session);
				
				var new_u = {
					protocol : u.protocol, // wanted protocol
					hostname : external.hostname,
					port     : external.port,
					pathname : pathname,
					search   : u.search,
					hash     : u.hash
				};
				
				new_u = url.format(new_u);
				
				return new_u;
			}
		}),
		relativize: function( u ){
			var
				tmp,
				orig_u = u,
				current_url = this.url( req.url, true, true ); // use the assumed external protocol by the target to be able to check for a security switch
			
			// make u absolute url in terms of target/server
			u = url.parse( url.resolve( current_url, u ));
			
			var internal = this.internal( u );
			
			if( !internal ){ // do not relativize an url to external servers
				return orig_u;
			}
			
			if( internal.secure_switch ) { // do not relativize an url for a protocol switch, because only an absolute url can be used to switch the protocol
				return url.format( this.reverse( u, true ) );
			}
			
			var // if url contains # and ? take the first (minimum index), if just one or none is found take that index (maximum index as the one/both not found is -1)
				hash_index       = orig_u.indexOf('#'),
				query_index      = orig_u.indexOf('?'),
				query_hash_index = ~query_index && ~hash_index ? Math.min(query_index,hash_index) : Math.max(query_index,hash_index),
				query_hash       = ~query_hash_index ? orig_u.substring(query_hash_index) : '',
				current          = this.url( url.parse(req.url) ),// current proxy url target
				
				current_pathname = current.pathname ? current.pathname : '/',
				      u_pathname =       u.pathname ? u.pathname       : '.',
				    new_pathname = u.pathname === current.pathname && 0===query_hash_index ? '' : M.relativize( current_pathname, u_pathname ),
				
				new_u            = new_pathname + query_hash;
			
			return new_u;
		},
		resolve: function( relative_u, with_http_server_port ){
			var
				current_url  = this.url(req.url, true ),
				absolute_url = M.resolve( current_url, relative_u ); // with http server port
			
			if(!with_http_server_port){ // strip it if not wanted
				absolute_url = url.parse( absolute_url ).path;
			}
			return absolute_url;
		}
	};
},{
	relativize:function F( base, path, no_cache ){
		/*!
		 * var
			cache = F.cache = F.cache || {},
			cache_base = cache[base] = cache[base] || {};
		if(!no_cache ) return cache_base[path] || (cache_base[path]=F(base,path,true));
		*/
		var
			tmp,
			session  = path && (tmp=path.split(';')) && 1 in tmp ? (path=tmp.shift()+';SESSION',tmp.join(';')) : null; // everything after the first ;
		
		path = url.resolve( base, path );
		
		if( '/' === base[0] ) base = base.substring(1);
		if( '/' === path[0] ) path = path.substring(1);
		
		if( '/' === base[base.length-1] ) base+=' ';     // to prevent ignoring the last component because of split / when / is at the end, we add an " "
		var folder = '/'===path[path.length-1];          // we keep a flag to add a slash at the end
		if(folder) path=path.substring(0,path.length-1); // remove it to prevent an empty split
		
		base = base.split('/'); path = path.split('/');
		
		for(var n=0, bl=base.length, pl=path.length, equal=true;n<bl && n<pl; n++){
			if(!(equal=(base[n]===path[n]))) break;
		}
		
		var relative_path = '';
		
		// add as many .. as needed
		bl=bl-(equal?0:1);
		for(var m=n; m < bl ; m++) { // add separator '/' when needed
			if(m!==n) relative_path+='/';
			relative_path+='..';
		}
		
		// add the components of the path after ..
		n=n-(equal?1:0);
		for(m=n; m < pl ; m++) {
			if(m!==n || relative_path.length > 0) relative_path+='/'; // add separator '/' when needed
			relative_path+=path[m];
		}
		
		if(folder ) relative_path += "/";
		if(session) relative_path = relative_path.replace(/;SESSION/,';'+session);
		
		return relative_path;
	},
	resolve:function( base, relative_path ){ // ALWAYS http://tools.ietf.org/html/rfc1808 conform unlike the 'url' module
		/*!
		
		 Here some info regarding resolving relative urls
		
		 see http://tools.ietf.org/html/rfc1808
		
		   * Step 6: The last segment of the base URL's path (anything
		           following the rightmost slash "/", or the entire path if no
		           slash is present) is removed and the embedded URL's path is
		           appended in its place.  The following operations are
		           then applied, in order, to the new path:
		
		           a) All occurrences of "./", where "." is a complete path
		              segment, are removed.
		
		           b) If the path ends with "." as a complete path segment,
		              that "." is removed.
		
		           c) All occurrences of "<segment>/../", where <segment> is a
		              complete path segment not equal to "..", are removed.
		              Removal of these path segments is performed iteratively,
		              removing the leftmost matching pattern on each iteration,
		              until no matching pattern remains.
		
		           d) If the path ends with "<segment>/..", where <segment> is a
		              complete path segment not equal to "..", that
		              "<segment>/.." is removed.
		
		example:
		  base: '/a/b/c'
		  so 'c' is removed from /a/b/c -> /a/b/
		
		  relative: '.'
		  /a/b/. -> /a/b/
		
		  relative: '.'
		  /a/b/.. -> /a/
		
		Note : url.resolve() works different when resolving
		* with *a base url* 'http://localhost/a/b/c'  + '.'  -> /a/b/ RFC 1808 conform!
		* with just a *path* '/a/b/c'  + '.' -> /a/b'   NO slash at the end!
		
		try it:
		[~]$ node
		> require('url').resolve('http://localhost/a/b/c','.')
		'http://localhost/a/b/'
		
		> require('url').resolve('/a/b/c','.')
		'/a/b'
		
		> // path is different!
		> require('path').resolve('/a/b/c','.')
		'/a/b/c'
		
		*/
		
		if(!relative_path){
			relative_path = base;
			base          = null;
		}
		if(typeof(base) !== 'string' ) base=null;
		
		// we have 5 cases:
		var
			has_net_loc              = base && /^[a-zA-Z]*:\//.test(base),                   // (1) has a net loc protocol:/  ( :// )
			absolute_base            = base && !has_net_loc && base[0]==='/',                // (2) we add / remove 'http://x:0'
			relative_base            = base && !has_net_loc && base[0]!=='/',                // (3) we add / remove 'http://x:0'+'/'
			no_base                  = !has_net_loc && !relative_base && !absolute_base,     // otherwise handle like no base:
			no_base_absolute_path    = no_base && relative_path && relative_path[0] === '/', // (4) we add / remove 'http://x:0'
			no_base_relative_path    = no_base && relative_path && relative_path[0] !== '/', // (5) we add / remove 'http://x:0'+'/'
			no_base_no_relative_path = no_base && !no_base_absolute_path && !no_base_relative_path, // (6) otherwise do not resolve
			absolute                 = absolute_base || no_base_absolute_path,               // (2) and (4) we add / remove 'http://x:0'
			relative                 = relative_base || no_base_relative_path;               // (3) and (5) we add / remove 'http://x:0'+'/'
		
		if( no_base_no_relative_path || absolute && relative || has_net_loc && no_base ){
			global_log.error && global_log.error('could not resolve',{ base:base, relative_path:relative_path, has_net_loc:has_net_loc, absolute:absolute, relative:relative });
			return relative_path;
		}
		
		// we add an artificial net_loc = 'http://x' to enforce url resolving and prevent path resolving, see http://tools.ietf.org/html/rfc1808
		var absolute_resolve_base = has_net_loc ? base : 'http://x:0' + ( absolute ? '' : '/' ) + (base || '');
		
		// resolve using the standard node module 'url'
		var absolute_url = url.format(url.resolve( absolute_resolve_base, relative_path ));
		
		// remove artificial net_loc = 'http://x:0' *iff* used. Note: if no base was provided, we remove also the first '/'
		return has_net_loc ? absolute_url : absolute_url.replace( absolute ? /^http:\/\/x:0/ : /^http:\/\/x:0\//,'');
	},
	
	
	/*!
	  helper to make an absolute within the context of a request.
	  use optional proxied_context = true, to geht an absolute URL for the proxied backend server
	*/
	absolutize : function( req, relative_path, with_http_server_port, proxied_context/*!optional*/ ){
		
		var proxy = proxied_context && req.proxy ? req.proxy : M(req); //  if in own context create a pseudo proxy context for the server itself
		
		return proxy.resolve( relative_path, with_http_server_port );
	},
	
	/*!
	  helper to make an absolute *externalized* request
	*/
	externalize : function( req, relative_url  ){
		var
			u           = M.absolutize( req, relative_url, true ),
			proxy       = M(req),
			current_url = proxy.url(req.url,true);
		
		return proxy.reverse.externalize(current_url,u) || u;
	},
	
	/*!
	  helper to make an absolute *internalized* request, that is without any external host / forwarded request consideration
	  but only using the curent real server config
	*/
	internalize : function( req, relative_url  ){
		// use a 'proxy' to our self ..localhost:...
		var
			server_config = req.server ? req.server.config : { hostname:'localhost' },
			self_url      = (server_config.protocol || 'http')+'://'+server_config.hostname+(server_config.port?':'+server_config.port:''),
			proxy         = M(req,{url:self_url}); // target is our internal self
		return proxy.resolve( relative_url, true );
	},
	
	/*! return an absolute secure url to the current page, 
	 * for a switch to https if one is needed otherwise return false
	 */
	secure : function( req ){
		var u=M.absolutize( req, '.', true );
		
		// check if already secure return
		if(u && /^([^:\/]*)s:/.test(u) ) return false;
		
		// add an s to the protocol (before the first :) and return new url
		if(u) u = u.replace(/^([^:\/]*):/,'$1s:');
		return u;
	}
});

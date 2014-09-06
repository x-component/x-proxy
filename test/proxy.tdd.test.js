'use strict';
// call with ./util/node_modules/vows/bin/vows util/test/proxy.test.js

require('x-test').vows(suite,test,suiteSetup,suiteTeardown); // support mixing tdd with vows like tests

var 
	assert     = require('assert'),
	proxy      = require('../proxy');

var check = function( base, url, result ){ // no absolutize, just 
	var o={
		topic:function( proxy ){
			//debugger;
			this.callback(proxy.relativize(base,url));
		}
	};
	o['check '+result]=function(res){ assert.equal(res,result); };
	return o;
};

suite.addBatch({
	'simple relativize tests': { topic: function(){ return proxy; },
		
		'testShorter' :           check('/a/b/c/d', '/a/b'     ,'../../b'),
		'testShorterAndSwitch' :  check('/a/b/c/d', '/a/b/e'   ,'../e'   ),
		'testLonger' :            check('/a/b/c'  , '/a/b/c/d' ,'c/d'    ),
		'testLongerAndSwitch' :   check('/a/b/c'  , '/a/b/e/d' ,'e/d'    ),
		'testEqual' :             check('/a/b/c'  , '/a/b/c'   ,'c'      ),
		'testEqualAndSwitch' :    check('/a/b/c'  , '/a/b/e'   ,'e'      ),
		
		'testShorterSlash' :           check('/a/b/c/d', '/a/b/'     ,'../../b/'),
		'testShorterAndSwitchSlash' :  check('/a/b/c/d', '/a/b/e/'   ,'../e/'   ),
		'testLongerSlash' :            check('/a/b/c'  , '/a/b/c/d/' ,'c/d/'    ),
		'testLongerAndSwitchSlash' :   check('/a/b/c'  , '/a/b/e/d/' ,'e/d/'    ),
		'testEqualSlash' :             check('/a/b/c'  , '/a/b/c/'   ,'c/'      ),
		'testEqualAndSwitchSlash' :    check('/a/b/c'  , '/a/b/e/'   ,'e/'      ),
		
		'testSlashShorter' :           check('/a/b/c/d/', '/a/b'     ,'../../../b'),
		'testSlashShorterAndSwitch' :  check('/a/b/c/d/', '/a/b/e'   ,'../../e'   ),
		'testSlashLonger' :            check('/a/b/c/'  , '/a/b/c/d' ,'d'         ),
		'testSlashLongerAndSwitch' :   check('/a/b/c/'  , '/a/b/e/d' ,'../e/d'    ),
		'testSlashEqual' :             check('/a/b/c/'  , '/a/b/c'   ,'../c'      ),
		'testSlashEqualAndSwitch' :    check('/a/b/c/'  , '/a/b/e'   ,'../e'      ),
		
		'testSlashShorterSlash' :           check('/a/b/c/d/', '/a/b/'     ,'../../../b/'),
		'testSlashShorterAndSwitchSlash' :  check('/a/b/c/d/', '/a/b/e/'   ,'../../e/'   ),
		'testSlashLongerSlash' :            check('/a/b/c/'  , '/a/b/c/d/' ,'d/'         ),
		'testSlashLongerAndSwitchSlash' :   check('/a/b/c/'  , '/a/b/e/d/' ,'../e/d/'    ),
		'testSlashEqualSlash' :             check('/a/b/c/'  , '/a/b/c/'   ,'../c/'      ),
		'testSlashEqualAndSwitchSlash' :    check('/a/b/c/'  , '/a/b/e/'   ,'../e/'      )
	},
	'resolve' : {
		topic: function(){ return proxy.resolve; },
		'resolve  a/b/../c'      : function( resolve ){ assert.equal(resolve( 'a/b/../c'    ),   'a/c'   ); },
		'resolve /a/b/../c'      : function( resolve ){ assert.equal(resolve('/a/b/../c'    ),  '/a/c'   ); },
		'resolve  a/b/./c'       : function( resolve ){ assert.equal(resolve( 'a/b/./c'     ),   'a/b/c' ); },
		'resolve /a/b/ and ../c' : function( resolve ){ assert.equal(resolve('/a/b/', '../c'),  '/a/c'   ); },
		'resolve  a/b/ and ../c' : function( resolve ){ assert.equal(resolve( 'a/b/', '../c'),   'a/c'   ); },
		'resolve  a/b/ and  ./c' : function( resolve ){ assert.equal(resolve( 'a/b/', './c' ),   'a/b/c' ); },
		'resolve  http://a/b/d/ and ../../c' : function( resolve ){ assert.equal(resolve( 'http://a/b/d/', '../../c' ), 'http://a/c');   },
		'resolve  http://a/b/d/ and .././c'  : function( resolve ){ assert.equal(resolve( 'http://a/b/d/', '.././c'  ), 'http://a/b/c'); },
		'resolve  alt/'          : function( resolve ){ assert.equal(resolve( 'alt/' ),   'alt/'   ); }
	}
});

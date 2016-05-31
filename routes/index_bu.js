var express = require('express');
var router = express.Router();
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var Url = require('url');
var frequest = require('request');

router.get('/test', function(req, res, next) {
var h='form data:' + JSON.stringify( req.body);//.data;
      res.write(h);
res.end(' - dummy');
});

router.get('/insert', function(req, res, next) {
var h='form data:' + JSON.stringify( req.body);//.data;
      res.write(h);
res.end(' - dummy');
});


router.post('/insert', function(req, res, next) {
//res.end(req.body.json);
  var existed=false;
  var url = 'mongodb://localhost:27017/feelter';
  MongoClient.connect(url, function(err, db) {
    assert.equal(null, err);
try{
	var j=JSON.parse(req.body.json);
	var p=JSON.parse(req.body.phrases);
	db.collection('phrase').save({_id:req.body._id,phrases:p,json:j},{},function(err,doc){
		db.close();
		if (err==null) {
			res.end(doc==1?'updated':'saved !');
		}
		else {
			res.end(err.message);
		}
	});

} catch(e){
res.end('err: '+e.message);
db.close();
}


return;
    if(req.body._id){
	db.collection('raw').find({_id:req.body._id }).count(function(error, nbDocs) {
    	    if(nbDocs==0){
		db.collection('raw').insertOne(req.body);
		res.write('inserted');    
	    } else {
		res.write('existed');
	    }
            res.end();
     	    db.close();
        });
    }
    else {
        db.collection('raw').insertOne(req.body);

      	var h='inserted from index.js';
	//h='form data:' + JSON.stringify(req.body);
      	res.write(h);
    
        res.end();
        db.close();
    }
  });
});

/* GET home page. */
router.get('/home', function(req, res, next) {

  var url = 'mongodb://localhost:27017/feelter';
  MongoClient.connect(url, function(err, db) {
    assert.equal(null, err);
    //console.log("Connected correctly to server.");
    findMentions(db, function(h) {
      //res.render('index', { title: h });
      res.writeHeader(200, {"Content-Type": "text/html"});  
      res.write(h+ ' count');
      res.end();
      db.close();
    });
  });
//  res.render('index', { title: 'FEELTER' });
});
router.get('/', function(req, res, next) {
try{
  var url = 'mongodb://localhost:27017/feelter';
//res.end(url);
  MongoClient.connect(url, function(err, db) {
    assert.equal(null, err);
      var url_parts = Url.parse(req.url, true);
      var aq=url_parts.query.q.trim().trim('|');
	var qs=aq.split('|');
	var returned=0;
	var expected=qs.length;
	var resp='';
	for(var i=0;i<qs.length;i++){
		var q=qs[i];
	
	      	getPhrase(db,q, function(h) {
			if (h!=''){
				if (h[0]=='[') h=h.substring(1,h.length-1);
				if (returned<expected-1) h+=',';
				resp+=h;
			}
			returned++;
			if (returned>=expected){
		
        	 		res.writeHeader(200, {"Content-Type": "text/plain"});
				if(url_parts.query.callback) res.write(url_parts.query.callback+'(');
				if(resp[0]!='[') res.write('[');

		        	 res.write(resp);
                                if(resp[0]!='[') res.write(']');
				resp=resp.replace(',]',']');

				 if(url_parts.query.callback) res.write(');');
			         res.end();
			         db.close();
			}
		    });
	}
  });
}catch(e){
res.end('error');
}
});

var getPhrase = function(db,q,callback){
if (q.length<4) {
if (q=='') q='_';
var ej={};
ej[q]='no data';
callback('');
return;
//callback(JSON.stringify(ej));
}
   var h='';
   var multi=false;
   var t=2;
   db.collection('phrase', function(err, collection) {
      collection.find({"_id":q
       }, {}, {limit:1}).toArray(
      function(err, items) {
       if(items.length>0)
	{
	  var j=items[0].json;
	  var jkp={};
	  jkp[q]=j[Object.keys(j)[0]];
	  jkp[q].sourcedb='cdn';
       	  callback(JSON.stringify(jkp)+'');//,{"sourcedb":"local"}');
	}
       else {
		//callback('{"'+q+'": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1"}}');
	frequest({url:'http://api.feelter.com', qs:{q:q}}, function(err, response, body) {
	  if(err) { callback('{"'+q+'": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error":JSON.stringify(err)}}'); return; }
//  console.log("Get response: " + response.statusCode);
 	 callback(response.body.replace(',"dbid"',',"sourcedb":"api","dbid"'));
	});

/*		var options = {
		  host: 'api.feelter.com',
		  port: 80,
		  path: '/',
		  qs: {q:q}
		};
		var body = '//proxy\n';
		http.get(options, function(respf){
callback('r1');
		  respf.on('data', function(chunk){
callback('rrrr');
		    body += chunk;
callback(body);
		  });
		
		  respf.on('end', function() {
			callback(body);
		  });

		  respf.on("error", function(e){
			callback('{"'+q+'": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error":e.message}}');

	 	  });
		});
*/



	}
   });

//   callback('no records found');
});



return;

 var cursor =db.collection('raw').find();//{ "_id": q } );
   cursor.each(function(err, doc) {
      assert.equal(err, null);
      if (doc != null) {
//         if (h!=''){multi=true; h+=',';}
         callback(JSON.stringify(doc));
return;
      } else {
//         if (multi) h='['+h+']';
//         h+='<form method="post" action="insert"><input name="data"/><input type="submit"/></form>';
         callback('none');
      }
   });
}

var findMentions = function(db, callback) {
   var h='';
   var multi=false;
//callback('ccc');
db.collection('phrase').count(function(error, nbDocs) {
    h='count: ' + nbDocs;
    h+='<form method="post" action="search"><input name="data"/><input type="submit/></form>';
    callback(h);
});

return;
   var cursor =db.collection('raw').find();// { "_id": "1234567890" } );
   cursor.each(function(err, doc) {
      assert.equal(err, null);
      if (doc != null) {
	 if (h!=''){multi=true; h+=',';}
         h+=JSON.stringify(doc);
      } else {
	 if (multi) h='['+h+']';
	 h+='<form method="post" action="insert"><input name="data"/><input type="submit"/></form>';
         callback(h);
      }
   });
}



router.get('/search', function(req, res, next) {
  var url = 'mongodb://localhost:27017/mentions';
  MongoClient.connect(url, function(err, db) {
    assert.equal(null, err);
      var url_parts = Url.parse(req.url, true);
      var q=url_parts.query.q;
      searchMentions(db,q, function(h) {
      res.writeHeader(200, {"Content-Type": "text/html"});
      res.write('zzz'+h+' q:'+ q);
      res.end();
      db.close();
    });
  });
});


var searchMentions = function(db,q, callback) {
//try{
   var h='';
   var multi=false;
   var t=2;
   db.collection('raw', function(err, collection) {
      collection.find({
         "$text": {
         "$search": q
       }}, {}, {limit:3}).toArray(
      function(err, items) {
//       callback(items.length);return;
         if (err!=null){callback(err);return;}
         for (var i=0;i<items.length;i++){
            if (h!=''){multi=true; h+=',';}
            h+=JSON.stringify(items[i]);
         } 
         if (multi) h='['+h+']';
         callback(h);
         return;
      
   });

//   callback('no records found');
});
//}
//catch(e){
//      callback(e);
//}
}





module.exports = router;

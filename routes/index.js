var express = require('express');
var router = express.Router();
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var Url = require('url');
var frequest = require('request');
var quota = require('../logic/quota').quota;
var formats = require('../logic/formats').formats;

// ====================================== //
//          cdn - api endpoint            //
// ====================================== //

router.get('/', function(req, res, next) {
    try {
        var url_parts = Url.parse(req.url, true);
        var aq = url_parts.query.q.trim().trim('|');
        var qs = aq.split('|');
        if (req.headers.referer){
            var ref_parts = Url.parse(req.headers.referer, true);
            req.headers.refid=ref_parts.hostname;
        }
        else req.headers.refid = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        //Quota checks
        if (quota.blockAll(req.headers.refid, qs[0])) {
            res.end('{"' + qs[0] + '": {"no_data": "global Quota exceeded","helper": "","dbid": "-1"}}')
            //res.status(402).end('Quota exceeded');
            return;
        }
        var url = 'mongodb://127.0.0.1:27017/feelter';
        MongoClient.connect(url, function(err, db) {
            try {
                //assert.equal(null, err);
                if (err != null) {
                    res.end(err);
                    return;
                }
                var returned = 0;
                var expected = qs.length;
                var resp = '';

                // handle multiple keyphrases in a single request

                for (var i = 0; i < qs.length; i++) {
                    var q = qs[i];
                    getPhrase(db, q, req, function(h) {
                        try {

                            if (h != '') {
                                if (h[0] == '[') h = h.substring(1, h.length - 1);
                                if (returned < expected - 1) h += ',';
                                resp += h;
                            }
                            returned++;
                            if (returned >= expected) {

                                // send response to client
                                if (req.query.format && (req.query.format.toLowerCase()=='iframe' || req.query.format.toLowerCase()=='html')){
                                    res.writeHeader(200, {
                                        "Content-Type": "text/html"
                                    });
                                    res.write(formats.tamplates['iframe'][0] + '<script>var local_responseData = [' + resp + '];</script> <div id="preview" style=""><a class="MI_Feelter" mi-keyphrase="'+q+'"></a></div>');
                                    res.end(formats.tamplates['iframe'][2]);
                                    return;
                                }

                                res.writeHeader(200, {
                                    "Content-Type": "text/plain"
                                });
                                if (url_parts.query.callback) res.write(url_parts.query.callback + '(');

                                if (resp[0] != '[') res.write('[');
                                res.write(resp);
                                if (resp[0] != '[') res.write(']');
                                resp = resp.replace(',]', ']');

                                if (url_parts.query.callback) res.write(');');
                                res.end();
                                db.close();
                            }
                        }
                        catch (e1) {
                            res.end('error ' + e1);
                            db.close();
                            return;
                        }
                    });
                }
            }
            catch (e2) {
                res.end('error ' + e2);
                db.close();
                return;
            }
        });
    }
    catch (e3) {
        res.end('error ' + e3);
        return;
    }
});

// encode dots (.) & dollars ($)
var encodeID = function(_id) {
	return _id.replace('.', 'P').replace('$', 'D');
}

var getPhrase = function(db, q, req, callback) {
    try {
        // validation
        if (q.length < 4) {
            if (q == '') q = '_';
            var ej = {};
            ej[q] = 'no data';
            callback('');
            return;
            //callback(JSON.stringify(ej));
        }
        q = q.toLowerCase();
        var h = '';
        var multi = false;
        var t = 2;
//callback(q.replace(new RegExp('&','gi'),'&amp;'));
//return;
        var ampq=q.replace(new RegExp('&','gi'),'&amp;');
		var qEnc = encodeID(q);
        // request from mongo db
        db.collection('phrase', function(err, collection) {
            try {
                if (err != null) {
                    callback('error1: ' + err);
                    return;
                }
                collection.find({ $or:[
                  {"_id": qEnc}
                  ,{"phrases": ampq}]
                }, {}, {
                    limit: 1
                }).toArray(
                    function(err, items) {
                        try {
                            if (err != null) {
                                callback('error2: ' + err);
                                return;
                            }
                            if (items.length > 0 && !req.query.shard) {

                                // data available on mongo db

                                var j = items[0].json;
                                var jkp = {};
                                jkp[q] = j[Object.keys(j)[0]];
				                var d=new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                                jkp[q].sourcedb = 'cdn_nosql_v1';
				                jkp[q].servertime = d;
				                
                                quota.reportKnown(req.headers.refid, qs);
				                
                                callback(JSON.stringify(jkp) + '');
                            }
                            else {
                                //Quota checks
                                if (quota.blockUnknown(req.headers.refid, qs)) {
                                    callback('{"' + q + '": {"no_data": "new phrase Quota exceeded","helper": "","dbid": "-1"}}');
                                    return;
                                }

                                var qs={
                                        q: q
                                        ,ref:req.headers.refid
                                    };
                                if (req.query.shard) qs.shard = req.query.shard;
                                //callback(JSON.stringify(qs) + '');return;
                                frequest({
                                    url: 'http://54.187.35.9',
                                    qs: qs
                                }, function(err, response, body) {
                                    q=q.replace(new RegExp('"','gi'),'\\"');
                                    try {
                                        if (err) {
                                            callback('{"' + q + '": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error4":"' + JSON.stringify(err) + '"}}');
                                            return;
                                        }

                                        // successfull response from sql, TODO: save to mongo
                                        if (response.body.indexOf('new key phrase queued for research')>-1) quota.reportUnknown(req.headers.refid, q);
                                        else quota.reportKnown(req.headers.refid, q);
                                        
					                    var d=new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); 
                                        callback(response.body.replace(/,\s"dbid"/, ',"sourcedb":"cdn_mysql_v1","servertime":"'+d+'","dbid"'));
                                    }
                                    catch (e1) {
                                        callback('{"' + q + '": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error5":"' + JSON.stringify(e1) + '"}}');
                                    }
                                });
                            }
                        }
                        catch (e2) {
                            callback('{"' + q + '": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error6":"' + e2.message + '"}}');
                        }
                    });
            }
            catch (e3) {
                callback('{"' + q + '": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error7":"' + JSON.stringify(e3) + '"}}');
            }
        });
    }
    catch (e4) {
        callback('{"' + q + '": {"no_data": "new key phrase queued for research","helper": "","dbid": "-1","error8":"' + JSON.stringify(e4) + '"}}');
    }
}

// ====================================== //
//          find                          //
// ====================================== //

var finDocs = function(req, res, next) {
    try {
        var url = 'mongodb://127.0.0.1:27017/feelter';
        MongoClient.connect(url, function(err, db) {
            try {
                if (err != null) {
                    res.end('Error: connect: ' + err);
                    return;
                }
                var url_parts = Url.parse(req.url, true);
                //var query = {_id:{$gt:q}};
				//var fields = {_id:1};
				//var options = {limit:10};
				var query = JSON.parse(url_parts.query.q);
				var fields = JSON.parse(url_parts.query.f);
				var options = JSON.parse(url_parts.query.o);
				db.collection('phrase', function(err, collection) {
					try {
						if (err != null) {
							res.end('Error: collection: ' + err);
							return;
						}
						var cursor = collection.find(query, fields, options);
						cursor.toArray(function(err, items) {
							try {
								if (err != null) {
									res.end('Error: toArray: ' + err);
									return;
								}
								res.writeHeader(200, {
									"Content-Type": "text/plain"
								});
								res.write(JSON.stringify(items));
								res.end();
								db.close();
								return;
							}
							catch (e4) {
								res.end('Error: 4: ' + e4);
							}
						});
					}
					catch (e3) {
						res.end('Error: 3: ' + e3);
					}
				});
            }
            catch (e2) {
                res.end('Error: 2: ' + e2);
                db.close();
                return;
            }
        });
    }
    catch (e1) {
        res.end('Error: 1: ' + e1);
        return;
    }
};

router.get('/find', finDocs);
router.post('/find', finDocs);

// ====================================== //
// upsert data, called from relational db //
// ====================================== //

router.post('/insert', function(req, res, next) {
   // res.end('canceled');
    //return;
    var existed = false;
    var url = 'mongodb://127.0.0.1:27017/feelter';
    MongoClient.connect(url, function(err, db) {
        assert.equal(null, err);
        try {
            var _id = req.body._id.toLowerCase();
			var _idEnc = encodeID(_id);
            if (!req.body.json || req.body.json==''){
				db.collection('phrase').remove({
                    _id: _idEnc
                }, {}, function(err) {
                    db.close();
                    if (err == null) {
                        res.end('deleted !');
                    }
                    else {
                        res.end(err.message);
                    }
                });
            }
            else{
                var j = JSON.parse(req.body.json);
				var jEnc = {};
				jEnc[_idEnc] = j[Object.keys(j)[0]];
                var p = JSON.parse(req.body.phrases.toLowerCase());
                db.collection('phrase').save({
                    //_id: _id,
                    _id: _idEnc,
                    phrases: p,
                    //json: j
                    json: jEnc
                }, {}, function(err, doc) {
                    db.close();
                    if (err == null) {
                        res.end(doc == 1 ? 'updated' : 'saved !');
                    }
                    else {
                        res.end(err.message);
                    }
                });
            }
        }
        catch (e) {
            res.end('err: ' + e.message);
            db.close();
        }
    });
});

// dummy method, post wong work if no get defined

router.get('/insert', function(req, res, next) {
    var h = 'form data:' + JSON.stringify(req.body); //.data;
    res.write(h);
    res.end(' - dummy');
});

// test functions

router.get('/test', function(req, res, next) {
    var h = 'form data:' + JSON.stringify(req.body); //.data;
    res.write(h);
    res.end(' - dummy');
});

router.get('/home', function(req, res, next) {

    var url = 'mongodb://127.0.0.1:27017/feelter';
    MongoClient.connect(url, function(err, db) {
        assert.equal(null, err);
        findMentions(db, function(h) {
            //res.render('index', { title: h });
            res.writeHeader(200, {
                "Content-Type": "text/html"
            });
            res.write(h + ' count');
            res.end();
            db.close();
        });
    });
});
var findMentions = function(db, callback) {
    var h = '';
    var multi = false;
    //callback('ccc');
    db.collection('phrase').count(function(error, nbDocs) {
        h = 'count: ' + nbDocs;
        h += '<form method="post" action="search"><input name="data"/><input type="submit/></form>';
        callback(h);
    });


}

router.get('/search', function(req, res, next) {
    var url = 'mongodb://127.0.0.1:27017/feelter';
    MongoClient.connect(url, function(err, db) {
        assert.equal(null, err);
        var url_parts = Url.parse(req.url, true);
        var q = url_parts.query.q;
        searchMentions(db, q, function(h) {
            //res.writeHeader(200, {
            //"Content-Type": "text/html"
            //});
            res.write(url_parts.query.callback + '(' + h + ')');
            res.end();
            db.close();
        });
    });
});
var searchMentions = function(db, q, callback) {
    var h = '';
    var multi = false;
    var t = 2;
    var trimmedq = false;
    var find = {
        _id: {
            '$regex': q
        }
        //,"$where":"this._id.length <= "+(q.length+10)
    }
    if (q.indexOf(' ') > -1) {
        var trimmedq = q.substring(0, q.indexOf(' ')).trim();
        find['$text'] = {
            "$search": '' + trimmedq + ''
        };
        //h=trimmedq;
    }

    db.collection('phrase', function(err, collection) {
        collection.find(find, {
                phrases: 1,
                //_id:1,
                score: {
                    $meta: "textScore"
                }
            }, {
                limit: 500
            })
            .sort({
                score: {
                    $meta: "textScore"
                }
            })
            .toArray(
                function(err, items) {
                    //       callback(items.length);return;
                    if (err != null) {
                        callback(err);
                        return;
                    }
                    items.sort(function(a, b) {
                        return a._id.length - b._id.length
                    });
                    items.sort(function(a, b) {
                        return b.phrases.length - a.phrases.length
                    });
                    for (var i = 0; i < Math.min(20, items.length); i++) {
                        if (items[i]._id.length > q.length + 20) continue;
                        if (h != '') {
                            multi = true;
                            h += ',';
                        }
                        //delete items[i].phrases;
                        h += JSON.stringify({
                            label: items[i]._id,
                            category: 'cat'
                        });
                    }
                    //if (multi) 
                    h = '[' + h + ']';
                    callback(h);
                    return;

                });

        //   callback('no records found');
    });
}

module.exports = router;

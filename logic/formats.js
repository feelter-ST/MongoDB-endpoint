var http = require('http');
var formats = {
    tamplates: {},
    loadcount: 0,
    loadtime: new Date(),
    load: function() {
        this.loadtime = new Date();
        this.loadcount++;
        var url = 'http://feelter.com/iframe.html?t='+new Date();
        var that = this;
        http.get(url, function(res) {
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                that.tamplates['iframe'] = body.split(new RegExp('<!-- end segment: .+ -->','gi'));
            });
        }).on('error', function(e) {
            console.log("Got an error: ", e);
        });
    }
}
formats.load();
exports.formats = formats;

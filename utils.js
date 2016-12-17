var FS = require("fs");
var PATH = require("path");

exports.parseRange = function (str, size) {
    if (str.indexOf(",") != -1) {
        return;
    }
    if(str.indexOf("=") != -1){
        var pos = str.indexOf("=")
        var str = str.substr(6, str.length)
    }
    var range = str.split("-");
    //console.log(range)
    var start = parseInt(range[0], 10)
    var end = parseInt(range[1], 10) || size - 1
    //console.log(start)
    //console.log(end)

    // Case: -100
    if (isNaN(start)) {
        start = size - end;
        end = size - 1;
        // Case: 100-
    } else if (isNaN(end)) {
        end = size - 1;
    }

    // Invalid
    if (isNaN(start) || isNaN(end) || start > end || end > size) {
        return;
    }
    return {
        start: start,
        end: end
    };
};

var videos_ext = ["ts", "mp4", "flv", "rmvb", "rm", "avi", "mkv"];

exports.isVideo = function (extension) {
    for (ext in videos_ext) {
        if (extension == videos_ext[ext]) {
            return true;
        }
    }
    return false;
};

exports.rmDir = function (path, orignPath) {

    FS.readdir(path, (err, lists) => {

        if (err) {
            console.error(err.message);
        }

        for (index in lists) {
            itemPath = PATH.join(path, lists[index]);
            try {
                var stat = FS.statSync(itemPath);
                if (stat.isFile()) {
                    try {
                        FS.unlinkSync(itemPath);
                    } catch (err) {
                        console.error(err.message);
                    }
                    
                }
                else if (stat.isDirectory()) {
                    this.rmDir(itemPath, orignPath);
                }
            } catch (err) {
                console.log(err.message);
            }
            
        }

        if (tmpPath != path) {
            try {
                FS.rmdirSync(path);
            } catch (err){
                console.log(err.message);
            }
        }
    });

};
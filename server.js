var PORT = 8899;
var ADDRESS = "0.0.0.0";

var HTTP = require("http");
var URL = require("url");
var FS = require("fs");
var PATH = require("path");
var CHILD = require("child_process");
var QUERY = require("querystring");
var FFMPEG = require("fluent-ffmpeg");
var ICONV = require("iconv-lite");
var UTILS = require("./utils.js");
var MIME = require("./mime.js");

var server = HTTP.createServer(function (request, response) {
	var arg = URL.parse(request.url, true).query;
	var pathname_re = URL.parse(request.url).pathname;
	var pathname_abs = PATH.join(__dirname, pathname_re);
	var fileExtension = pathname_re.substring(pathname_re.lastIndexOf('.') + 1);

	//redirect!
	if (pathname_re == "/") {
		console.log("redirect!!!");
		response.writeHead(302, {
			"location": "./resources"
		});
		response.end();
		return;
	}

	console.log(request.method);

	//main server
	if (request.method == "POST") {
		
		var postData = "";
		// data receiving
	    request.addListener("data", function (postDataChunk) {
	        postData += postDataChunk;
	    });

	    // data transfer end
	    request.addListener("end", function () {
	        console.log('post data has been received!');
	        var arg = QUERY.parse(postData);
	        console.log(arg);

	        //actions
			if (arg && arg.action == "stop") {
				CHILD.execFile('KILL_FFMPEG.bat', { encoding: "gbk" }, (error, stdout, stderr) => {
				    if (error) {
				    	console.log(decode(stdout));
		  				console.log(decode(stderr));
				        response.write("ffmpeg is not running!");
				        response.end();
				        return;
				    }
				    console.log(decode(stdout));
		  			console.log(decode(stderr));
		  			response.write("stop successed!");
		  			response.end();
				});
				return;
			}

			else if (arg && arg.action == "clean") {
				tmpPath = PATH.join(__dirname, "tmp");
				response.write("clean start!");
		  		response.end();
				UTILS.rmDir(tmpPath, tmpPath);
				return;
			}	

	    });
	}
	
	// file server
	else {
			//file server
		FS.stat(pathname_abs, function(err1, stat) {
			if (!err1){
				//dir
				if (stat.isDirectory()) {
					//homepage
					if (pathname_re == "/") {
						pathname_re = PATH.join(pathname_re, "resources");
						pathname_abs = PATH.join(pathname_abs, "resources");
					}
					var defaultIndexPath = PATH.resolve('index_template.html');
	                FS.exists(defaultIndexPath, function (isExists) {
	                	if (isExists) {
	                		var template = FS.readFileSync(defaultIndexPath, 'utf-8');

			                var content = getContent(pathname_abs, pathname_re);

			                template = template.replace('%content%', content);

			                response.writeHead(200, {'Content-Type':'text/html'});
							response.write(template);
							response.end();
	                	}
	                	else {
	                		console.log(defaultIndexPath);
				            response.writeHead(404, {'Content-Type':'text/plain'});
							response.write("No index page.");
							response.end();
	                	}
	                });
				}
				//file
				else if (stat.isFile()) {
					//non video stream
					if (UTILS.isVideo(fileExtension) == false){
						FS.readFile(pathname_abs, "binary", function(err2, file){
							if (err2) {
								console.log(err2);
								response.writeHead(500, {'Content-Type':'text/plain'});
								response.end(err2.message);
							}

							else {
								console.log("non video stream:", fileExtension);
								response.writeHead(200, {'Content-Type': MIME(fileExtension)});
								response.write(file, "binary");
								response.end();
							}
						});
					}

					//video stream
					else {
						// mp4
						if (fileExtension == "mp4" || fileExtension == "ts") {

							//tricks
							if (fileExtension == "ts") {
								pathname_abs = pathname_abs.replace("/resources", "/tmp");
							}

							var stat = FS.statSync(pathname_abs);
							response.setHeader("Content-Type", "video/mp4");

							//range 
							if (request.headers["range"]){
								console.log(request.headers["range"]);
								var range = UTILS.parseRange(request.headers["range"], stat.size);
								console.log(range);

								//legal
								if (range){
									response.setHeader("Content-Range", "bytes " + range.start + '-' + range.end + '/' + stat.size);
									response.setHeader("Content-Length", range.end - range.start + 1);
									var stream = FS.createReadStream(pathname_abs, {
										"start": range.start,
										"end": range.end
									});

									response.writeHead("206", "Partial Content");
									stream.pipe(response);
								}

								//illegal
								else {
									response.removeHeader("Content-Length");
									response.writeHead("416", "Request range not satisfiable.");
									response.end();
								}
							}

							//non-range
							else {
								var stream = FS.createReadStream(pathname_abs);
								response.writeHead("200", "Partial Content");
								stream.pipe(response);
							}
						}

						//convert 2 mp4
						else {
							var tmpPath_re = pathname_re.replace("/resources", "/tmp") + ".m3u8";
							var tmpPath_abs = PATH.join(__dirname, tmpPath_re);
							//var stream = FS.createWriteStream(tmpPath_abs);
							//console.log(tmpPath_abs);
							var command = FFMPEG(pathname_abs)
								.audioCodec("aac")
								.videoCodec("libx264")
								.format("hls")
								.outputOptions([
									"-map 0",
									"-hls_time 20"
									])
								.on('start', function(commandLine) {
									console.log('Spawned Ffmpeg with command: ' + commandLine);
									playHLS(tmpPath_abs, tmpPath_re, response);
								  })
								.on('error', function(err) {
								    console.log('An error occurred: ' + err.message);
								  })
								.on('progress', function(progress) {
								    console.log('Processing: ' + progress.percent + '% done');
								  })
								.output(tmpPath_abs);
							command.run();
						}
					}
				}
				else {
					response.writeHead(404, {'Content-Type':'text/plain'});
					response.write("This request URL " + pathname_re + "was not found on this server.");
					response.end();
				}

			}

			else {
				console.log(err1);
				response.writeHead(404, {'Content-Type':'text/plain'});
				response.write("This request URL " + pathname_re + "was not found on this server.");
				response.end();
			} 
		});

	}

});


function decode(str, binaryEncoding = "gbk", encoding = "cp936") {
	return ICONV.decode(new Buffer(str, binaryEncoding), encoding);
}

function playHLS(path_abs, path_re, response) {

	FS.readFile(path_abs, "binary", function(err, file){

		if (err) {
			console.log(err);
			playHLS(path_abs, path_re, response);
		}

		else {
			// response.writeHead(200, {'Content-Type':MIME("m3u8")});
			// response.write(path_abs, "binary");
			response.writeHead(200, {'Content-Type':'text/html'});
			response.write("Transcoding...<br/>")
			response.write('<a href="' + path_re + '">' + path_re + '</a>');
			response.end();
		}
	});
}

function getContent(path_abs, path_re) {
	console.log("open: ", path_re);
	var result = "";

	if (path_re != "\\" && path_re != "\\resources") {
		result += '<li class="dir"><a href="../">' + "返回上一级" + '</a></li>';
	}

	var lists = FS.readdirSync(path_abs).map(function (item) {
	            
        var stat = FS.statSync(PATH.resolve(path_abs, item));

        if (stat.isFile()) {
            return '<li class="file"><a href="' + PATH.join(path_re, item) + '">' + item + '</a></li>';
        }
        else if (stat.isDirectory()) {
            return '<li class="folder"><a href="' + PATH.join(path_re, item) + '">' + item + '</a></li>';
        }
        else {
            return "";
        }
    });

	result += lists.join("\n");	        
	console.log(result);
	return result;  
}

server.listen(PORT, ADDRESS);
console.log('Server running at port: ' + PORT + '.');
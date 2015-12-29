/*
* grunt-browserstack-screenshots
* https://github.com/MarkusPint/grunt-browserstack-screenshots
*
* Copyright (c) 2015 Markus Pint
* Licensed under the MIT license.
*/

"use strict";

var BsTunnel = require( "browserstacktunnel-wrapper" );
var request = require( "request-promise" );
var Promise = require( "bluebird" );
var ProgressBar = require( "progress" );
var fs = Promise.promisifyAll( require("fs") );
var mkdirp = require( "mkdirp" );
var wget = require( "wgetjs" );
var path = require( "path" );
var util = require( "util" );

module.exports = function( grunt ) {

	grunt.registerMultiTask( "screenshots", "Take multiple screenshots of a local site via BrowserStack", function() {
		
		var tunnel;

		// Set some defaults as well
		var options = this.options( {
			downloadPath: "tmp",
			local: true,
			wait_time: 5
		} );

		var	endTask = this.async();

		var jobs = [];

		var doneScreenshots = [];
		var requiredScreenshots = 0;

		var progressBar;

		function Job( route, id, screenshots ) {

			function generateName( route ) {

				// If empty or slash => index
				// If /faq => faq
				// If /blog/blog-post => blog_blog-post

				if ( route === "/" || route === "" ) {
					return "index";
				}

				if ( ( route.match( /\//g ) || [] ).length > 1 ) {
					// More than one forward-slash ie. has a complex path
					var components = route.split( "/" );
					var name = "";

					for ( var i = 1; i < components.length; i++ ) {

						if ( i === components.length - 1 ) { 
							name += components[ i ];
						} else {
							name += components[ i ] + "_";
						}

					};

					return name;

				}

				// Still here
				return route.replace( "/", "" );

			};

			this.name = generateName( route );
			this.id = id;
			this.screenshots = screenshots;
			this.done = false;

		};

		var baseRequest = request.defaults( {
			json: true,
			encoding: "utf8",
			baseUrl: "https://www.browserstack.com",
			auth: {
				user: options.bsUser,
				password: options.bsKey
			}
		} );

		var launchTunnel = function( callback ) {

			var isTunnelRequired = ( options.local === true );

			if ( !isTunnelRequired ) {
				callback();
				return;
			}

			tunnel = new BsTunnel( {
				key: options.bsKey,
				force: true // Kill any existing instances
			} );

			tunnel.start( function( error ) {

				if ( error ) {
					grunt.log.error( "Could not start tunnel" );
					grunt.log.error( error );
				} else {
					grunt.log.ok( "Started tunnel successfully" );
					callback();
				}

			} );

		};

		var closeTunnel = function() {

			if ( tunnel !== undefined ) {

				tunnel.stop( function( error ) {

					if ( error ) {
						grunt.log.errorlns( "Could not close tunnel(s) due to: " + error + "." );
					} else {
						grunt.log.ok( "Successfully closed tunnel!" );
						endTask();
					}

				} );

			}

		};

		var createJob = function( route ) {

			return baseRequest( {
				url: "/screenshots",
				method: "POST",
				json: {
					url: options.baseUrl + route,
					browsers: options.browsers,
					local: options.local,
					wait_time: options.wait_time
				}
			} ).then( function(response) {
				jobs.push( new Job( route, response.job_id, response.screenshots ) );
				return response;
			} );

		};

		var getJob = function( jobID ) {

			return baseRequest( {
				url: "/screenshots/" + jobID + ".json",
				method: "GET"
			} );

		};

		var updateProgress = function( screenshotsUpdate ) {

			for ( var i = 0; i < screenshotsUpdate.length; i++ ) {
				
				var found = false;

				for ( var j = 0; j < doneScreenshots.length; j++ ) {

					if ( screenshotsUpdate[i].id === doneScreenshots[j] ) {
						// Already saved to doneScreenshots
						found = true;
					}

				}

				if ( !found && screenshotsUpdate[i].state === "done" ) {
					doneScreenshots.push( screenshotsUpdate[i].id );
					progressBar.tick();
				}

			}

		};

		var pollJob = function( job ) {

			return ( function loop( value ) {

				if ( value === false ) { return; }

				if ( value > 10 ) { 
					console.log( "job timeout " + job.id );
					grunt.log.errorlns( "Job timeout: " + job.id );
					return;
				}

				return getJob( job.id ).then( function( jobUpdate ) {

					job.screenshots = jobUpdate.screenshots;

					updateProgress( jobUpdate.screenshots );

					if ( jobUpdate.state === "done" ) {
						job.done = true;
						return false;
					}

					return Promise.delay( 15000 ).then(function() {
						return value + 1;
					});

				} ).then( loop );

				return Promise.resolve( value );

			} )( 0 );

		};

		var pollJobs = function() {

			var pollJobs = [];

			for ( var i = 0; i < jobs.length; i++ ) {
				pollJobs.push( pollJob( jobs[i] ) );
			}

			return Promise.all( pollJobs );

		};

		var createJobs = function() {

			// Needs to create a screenshot request for each route
			// Need to ping each job periodically until success
			// Need to show screenshots progress in CLI

			requiredScreenshots = options.routes.length * options.browsers.length; 

			progressBar = new ProgressBar( "Polling screenshots: :bar", { total: requiredScreenshots, width: 100 } );
			// Force it to appear right away
			progressBar.tick( 0 );

			var jobPromises = [];

			for ( var i = 0; i < options.routes.length; i++ ) {
				jobPromises.push( createJob( options.routes[i] ) );
			}

			return Promise.all( jobPromises );

		};

		var downloadScreenshots = function() {

			var downloadJobScreenshots = function( job ) {

				var downloads = [];

				for ( var i = 0; i < job.screenshots.length; i++ ) {

					if ( job.screenshots[i].state === "done" ) {
						downloads.push( downloadScreenshot( job.screenshots[i], job.name ) );
					}

				}

				return Promise.all( downloads );

			};

			var generateScreenshotPath = function( imageUrl, directory ) {

				var fileName = imageUrl.substr( imageUrl.lastIndexOf( "/" ) + 1 );
				return path.join( options.downloadPath, directory, fileName );

			};

			var downloadScreenshot = function( screenshot, directory ) {

				mkdirp.sync( path.join( options.downloadPath, directory ) );

				return new Promise(function (resolve, reject) {

					wget({
						url: screenshot.image_url,
						dest: generateScreenshotPath( screenshot.image_url, directory )
					}, function() {
						resolve();
					});

				});

			}; 

			var jobDownloads = [];

			for ( var i = 0; i < jobs.length; i++ ) {
				jobDownloads.push( downloadJobScreenshots( jobs[i] ) );
			}

			return Promise.all( jobDownloads );

		};

		var reportSlack = function() {

			var slackPost = {
				username: "BrowserStack Screenshots",
				text: util.format( "These are screenshots of the latest *%s* build:", options.slack.projectTitle ),
				attachments: []
			};

			var generateScreenshotLink = function( imageUrl ) {

				var withExtension = imageUrl.substr( imageUrl.lastIndexOf( "/" ) + 1 );
				var withoutExtension = withExtension.replace( /.png|.jpg/g, "" );
				var link;

				return util.format( "<%s|%s>", imageUrl, withoutExtension );

			};

			var report = {
				text: "",
				color: "good",
				mrkdwn_in: [ "text" ]
			};

			var firstToUpperCase = function( str ) {
    			return str.substr(0, 1).toUpperCase() + str.substr(1);
			};

			for ( var i = 0; i < jobs.length; i++ ) {
				
				report.text += util.format( "*%s*\n", firstToUpperCase( jobs[i].name ) );

				for ( var j = 0; j < jobs[i].screenshots.length; j++ ) {

					if ( jobs[i].screenshots[j].state === "done" ) {

						if ( j === jobs[i].screenshots.length - 1 ) {
							// Last one
							report.text += generateScreenshotLink( jobs[i].screenshots[j].image_url ) + "\n\n";
						} else {
							report.text += generateScreenshotLink( jobs[i].screenshots[j].image_url ) + " / ";
						}

					}

				}

			}

			slackPost.attachments.push( report );

			return request( {
				method: "POST",
				url: options.slack.webhook,
				json: slackPost
			} );

		};

		launchTunnel( function() {

			createJobs().then(function() {

				pollJobs().then(function() {

					if ( typeof options.downloadPath === "string" && typeof options.slack === "undefined" ) {
						
						return downloadScreenshots().then(function() {
							grunt.log.ok( "Successfully downloaded all screenshots." );
						});

					} else if ( typeof options.slack === "object" ) {

						return reportSlack().then(function() {
							grunt.log.ok( "Successfully posted a Slack report." );
						});

					}

				}).then(function() {

					grunt.log.ok( "Closing tunnel..." );
					closeTunnel();

				});

			});

		} );

	} );

};
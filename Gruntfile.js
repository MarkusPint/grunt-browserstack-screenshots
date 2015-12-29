"use strict";

module.exports = function( grunt ) {

	// Project configuration.
	grunt.initConfig( {

		jshint: {
			all: [
				"Gruntfile.js",
				"tasks/*.js",
				"<%= nodeunit.tests %>"
			],
			options: {
				jshintrc: '.jshintrc',
			}
		},

		screenshots: {

			local_options: {
				options: {
					bsKey: process.env[ "BS_KEY" ],
					bsUser: process.env[ "BS_USER" ],
					local: false,
					downloadPath: "tmp",
					baseUrl: "http://dev.plastc.com",
					routes: [ "/", "/faq", "/blog" ],
					browsers: [
						{
							os: "Windows", 
							browser_version: "42.0", 
							os_version: "8.1", 
							browser: "chrome"
						},
						{
							os: "Windows", 
							browser_version: "37.0", 
							os_version: "8.1", 
							browser: "firefox"
                    	},
                    	{
							os: "Windows", 
							browser_version: "11.0", 
							os_version: "8.1", 
							browser: "ie"
                    	},
					]
				}
			}

		},

		// Before generating any new files, remove any previously-created files.
		clean: {
			tests: [ "tmp" ],
		},

		// Unit tests.
		nodeunit: {
			tests: [ "test/*_test.js" ],
		}

	} );

	// Actually load this plugin's task(s).
	grunt.loadTasks( "tasks" );

	// These plugins provide necessary tasks.
	grunt.loadNpmTasks( "grunt-contrib-jshint" );
	grunt.loadNpmTasks( "grunt-contrib-clean" );
	grunt.loadNpmTasks( "grunt-contrib-nodeunit" );

	// Whenever the "test" task is run, first clean the "tmp" dir, then run this
	// plugin's task(s), then test the result.
	grunt.registerTask( "test", [ "clean", "screenshots", "nodeunit" ] );

	// By default, lint and run all tests.
	grunt.registerTask( "default", [ "jshint", "test" ] );

};
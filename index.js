#!/usr/bin/env node

var fs = require('fs');
var exec = require('child_process').exec
var _ = require('underscore');
var queue = require('queue-async');

var argv = require('optimist')
    .describe('config', 'Settings file.')
    .default('config', './settings.json')
    .describe('frequency', 'Polling frequency in seconds.')
    .default('frequency', '30')
    .describe('out', 'File to write to.')
    .default('out', false)
    .describe('samples', 'Number of times to poll.')
    .default('samples', false)
    .describe('verbose', 'Enable verbose output')
    .default('verbose', false)
    .check(loadConfig)
    .argv;

var conf;
function loadConfig(args) {
    try {
        conf = require(args.config);
    }
    catch (e) {
        throw new Error('Unable to load configuration in ' + args.config);
    }

    args.samples = (args.samples === false ? false : parseInt(args.samples, 10));
}

var metric = function(settings) {
    this.history = [];
    _(this).defaults(settings);
    _(this).bindAll();
};

metric.prototype.run = function(unixtime, cb) {
    exec(this.command, function (error, stdout, stderr) {
        if (error) return cb(error);
        if (stderr) return cb(new Error(stderr));
        var out = parseFloat(stdout);
        if (!out && out !== NaN && out != 0) return cb(new Error('Invalid return value'));

        this.history.push({time: unixtime, value: out});
        cb(null);
    }.bind(this));
};

metric.prototype.min = function() {
    return _(this.history).chain().pluck('value').min().value();
}

metric.prototype.max = function() {
    return _(this.history).chain().pluck('value').max().value();
}

metric.prototype.average = function() {
    var sum = _(this.history).chain().pluck('value').reduce(function(m, n){
        return m + n;
    }, 0).value();

    return (sum / this.history.length);
}

metric.prototype.report = function() {
    var v = _(this.history).last()
    console.log("%s :: %s :: %d", this.name, new Date(v.time * 1000), v.value);
};

metric.prototype.toJSON = function() {
    return { name: this.name, history: this.history };
}

var metrics = _(conf).map(function(v) { return new metric(v) })

var schedule = function(items, wait, samples, done) {
    var start = +(new Date);
    var q = queue();
    _(items).each(function(v) {
        q.defer(function(ts, cb) {
            v.run(ts, function(err) {
                if (err) return cb(err)
                if (argv.verbose) v.report();
                cb();
            });
        }, (start / 1000 | 0));
    });
    q.await(function(err){
        if (err) return done(err);

        if (samples !== false) {
            samples--;
            if (samples <= 0) return done();
        }

        var delay = wait - (+(new Date) - start);
        if (delay < 0) {
            return done(new Error('command is too slow.'));
        }

        setTimeout(function() {
            schedule(items, wait, samples, done);
        }, delay);
    });
};


var onExit = function() {
    console.log("\nMeasured %d metrics %d times at %d second intervals",
        metrics.length, metrics[0].history.length, argv.frequency);

    _(metrics).each(function(m) {
        var min = m.min();
        var max = m.max();
        var ave = m.average();
        console.log('%s average: %d ( min %d : max %d )', m.name, ave, min, max);
    });

    if (argv.out) {
        var data = JSON.stringify(metrics, null, 4);

        fs.writeFile(argv.out, data, function(err) {
            if (err) {
                console.warn(err);
                process.exit(1);
            }
            console.log('Wrote results to ' + argv.out);
        });
    }
    process.exit();
};
process.on('SIGINT', onExit);

console.log("Starting run...\n");

var jobs = queue();
_(metrics).chain()
    .groupBy(function(v) { return parseInt(argv.frequency, 10) * 1000 })
    .each(function(items, wait) { jobs.defer(schedule, items, wait, argv.samples) });

jobs.await(function(err) {
    if (err) {
        console.warn(err.toString());
        onExit();
        return process.exit(1);
    }
    onExit();
});

(function() {
	

    var template = require('underscore/template'),
        fs = require('fs');
        
        template.settings.evaluate    = /<\?js([\s\S]+?)\?>/g;
        template.settings.interpolate = /<\?js=([\s\S]+?)\?>/g;
    
    /**
        @global
        @param {TAFFY} data See <http://taffydb.com/>.
        @param {object} opts
     */
    publish = function(data, opts) {
        var out = '',
            containerTemplate = template.render(fs.read(BASEDIR + 'templates/JSDoc-DataTables/tmpl/container.tmpl')),
            indexTemplate = template.render(fs.read(BASEDIR + 'templates/JSDoc-DataTables/tmpl/index.tmpl'));
        
        function render(tmpl, partialData) {
            var renderFunction = arguments.callee.cache[tmpl];
            if (!renderFunction) {
                renderFunction = arguments.callee.cache[tmpl] = template.render(fs.read(BASEDIR + 'templates/JSDoc-DataTables/tmpl/'+tmpl));
            }
            partialData.render = arguments.callee;
            partialData.find = find;
            partialData.linkto = linkto;
            partialData.htmlsafe = htmlsafe;
            
            return renderFunction.call(partialData, partialData);
        }
        render.cache = {};
        
        function find(spec) {
            return data.get( data.find(spec) );
        }
        
        function htmlsafe(str) {
            return str.replace(/</g, '&lt;');
        }

        function addSignatureParams(f) {
            var pnames = [];
            if (f.params) {
                f.params.forEach(function(p) {
                    if (p.name && p.name.indexOf('.') === -1) {
                        var type = "";
                        if (p.type && p.type.names){ type=':<span class="type-param">'+p.type.names.join('|')+"</span>"; }

                        if (p.optional) { pnames.push('['+p.name+type+']'); }
                        else { pnames.push(p.name+type); }
                    }
                });
            }
            f.signature = (f.signature || '') +
                '<span class="type-brace">(</span> '+pnames.join(', ')+' <span class="type-brace">)</span>';
        }
        
        function generateAncestry(doc) {
            var ancestors = [];

            while (doc = doc.memberof) {
                doc = data.get( data.find({longname: doc}) );
                if (doc) { doc = doc[0]; }
                if (!doc) break;
                ancestors.unshift( linkto(doc.longname, doc.name) );
            }
            return ancestors;
        }
        
        function addSignatureReturns(f) {
            var returnTypes = [];
            
            if (f.returns) {
                f.returns.forEach(function(r) {
                    if (r.type && r.type.names) {
                        returnTypes = r.type.names;
                    }
                });
            }
            
            f.signature = (f.signature || '') + (returnTypes.length ? 
                ':<span class="type-return">'+htmlsafe(returnTypes.join('|'))+'</span>' :
                '');
        }
        
        function addSignatureType(f) {
            var types = [];
            
            if (f.type && f.type.names) {
                types = f.type.names;
            }
            
            f.signature = (f.signature || '') + (types.length ? 
                ' :<span class="type-signature">'+htmlsafe(types.join('|'))+'</span>' :
                '');
        }
        
        function addAttribs(f) {
            var attribs = [];
            
            if (f.access && f.access !== 'public') {
                attribs.push(f.access);
            }
            
            if (f.scope && f.scope !== 'instance') {
                if (f.kind == 'function' || f.kind == 'property') attribs.push(f.scope);
            }
            
            if (f.readonly === true) {
                if (f.kind == 'property') attribs.push('readonly');
            }
            
            f.attribs = htmlsafe(attribs.length? '<'+attribs.join(', ')+'> ' : '');
        }
        
        data.remove({undocumented: true});
	    
	    var packageInfo = (data.get( data.find({kind: 'package'}) ) || []) [0];
        
        function renderLinks(text) {
            text = text.replace(/\{@link (\S+)\}/g, function(match, longname) {
            var link = linkto(longname);
                return link;
            });
            
            return text;
        }
        
	    data.forEach(function(doclet) {
	        doclet.signature = '';
            doclet.attribs = '';
            
	        if (doclet.kind === 'function' || doclet.kind === 'class') {
	            addSignatureParams(doclet);
	            addSignatureReturns(doclet);
	            addAttribs(doclet);
	        }
	        
	        if (doclet.kind === 'property') {
	            addSignatureType(doclet);
	            addAttribs(doclet)
	        }
	        
	        if (doclet.examples) {
	            doclet.examples = doclet.examples.map(function(example) {
	                var caption, code;
	                
	                if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
	                    caption = RegExp.$1;
	                    code    = RegExp.$3;
	                }
	                
                    return {
                        caption: caption || '',
                        code: code || example
                    };
                });
	        }
	    });
	    
	    data.orderBy(['longname', 'version', 'since']);
        
        // kinds of containers
        var globals = data.get( data.find({kind: ['property', 'function'], memberof: {isUndefined: true}}) ),
            modules = data.get( data.find({kind: 'module'}) ),
	        namespaces = data.get( data.find({kind: 'namespace'}) );
        
        var outdir = opts.destination;
        if (packageInfo) {
            outdir += '/' + packageInfo.name + '/' + packageInfo.version + '/';
        }
        fs.mkPath(outdir);
        
        // copy static files to outdir
        var fromDir = BASEDIR + 'templates/JSDoc-DataTables/static',
            staticFiles = fs.ls(fromDir, 3);
            
        staticFiles.forEach(function(fileName) {
            var toDir = fs.toDir(fileName.replace(fromDir, outdir+"/media/"));
            fs.mkPath(toDir);
            fs.copyFile(fileName, toDir);
        });
        
        function linkto(longname, linktext) {
            var url = longnameToUrl[longname];
            return url? '<a href="'+url+'">'+(linktext || longname)+'</a>' : (linktext || longname);
        }
        
        var containers= ['class', 'module', 'namespace'],
            urlToLongname = {},
            longnameToUrl = {};
        
        data.forEach(function(doclet) {
            if (containers.indexOf(doclet.kind) < 0) {
                var longname = doclet.longname,
                    urlSafe = ('global' || doclet.memberof).replace(/[^$a-z0-9._-]/gi, '_'), // TODO handle name collisions
                    url = urlSafe + '.html#'+doclet.name;
            }
            else {
                var longname = doclet.longname,
                    urlSafe = longname.replace(/[^$a-z0-9._-]/gi, '_'), // TODO handle name collisions
                    url = urlSafe + '.html';
            }
            
            // bidirectional lookups: url <=> longname
            urlToLongname[urlSafe]  = longname;
            longnameToUrl[longname] = url;
        });
        
        // do this after the urls have all been generated
        data.forEach(function(doclet) {
            if (doclet.classdesc) doclet.classdesc = renderLinks(doclet.classdesc);
            if (doclet.description) doclet.description = renderLinks(doclet.description);
            if (doclet.params) {
							doclet.params.forEach( function(param) {
								param.description = renderLinks(param.description);
							} );
						}
            
            doclet.ancestors = generateAncestry(doclet);
        });
        
        
        for (var longname in longnameToUrl) {
            var classes = data.get( data.find({kind: 'class', longname: longname}) );
            if (classes.length) generate('Class: '+classes[0].name, classes, longnameToUrl[longname]);
        
            var modules = data.get( data.find({kind: 'module', longname: longname}) );
            if (modules.length) generate('Module: '+modules[0].name, modules, longnameToUrl[longname]);
            
            var namespaces = data.get( data.find({kind: 'namespace', longname: longname}) );
            if (namespaces.length) generate('Namespace: '+namespaces[0].name, namespaces, longnameToUrl[longname]);        
        }
        
        if (globals.length) generate('Global', [{kind: 'globalobj'}], 'global.html');
        
        var classes = data.get( data.find({kind: 'class'}) );
        if (classes.length) generate('Table of Contents', classes, 'index.html', indexTemplate);

         
        function generate(title, docs, filename, template) {
            if ( typeof template == 'undefined' ) {
                template = containerTemplate
            }

            var data = {
                title: title,
                docs: docs,
                nav: '',
                
                // helpers
                render: render,
                find: find,
                linkto: linkto,
                htmlsafe: htmlsafe
            };
            
            var path = outdir + '/' + filename,
                html = template.call(data, data);
                
            fs.write(path, html)
        }
    }
    
})();

function privateSort ( a, b )
{
    var x = a.name.replace(/^_/, 'zz').toLowerCase();
    var y = b.name.replace(/^_/, 'zz').toLowerCase();
    return ((x < y) ? -1 : ((x > y) ? 1 : 0));
}

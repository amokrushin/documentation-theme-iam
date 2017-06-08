const fs = require('fs');
const path = require('path');
const File = require('vinyl');
const vfs = require('vinyl-fs');
const _ = require('lodash');
const concat = require('concat-stream');
const GithubSlugger = require('github-slugger');
const hljs = require('highlight.js');
const createFormatters = require('./util/formatters');
const LinkerStack = require('./util/linker_stack');

module.exports = (comments, config) => {
    const linkerStack = new LinkerStack(config)
        .namespaceResolver(comments, (namespace) => {
            const slugger = new GithubSlugger();
            return `#${slugger.slug(namespace)}`;
        });

    const formatters = createFormatters(linkerStack.link);

    hljs.configure(config.hljs || {});

    const sharedImports = {
        imports: {
            slug(str) {
                const slugger = new GithubSlugger();
                return slugger.slug(str);
            },
            shortSignature(section) {
                let prefix = '';
                if (section.kind === 'class') {
                    prefix = 'new ';
                } else if (section.kind !== 'function') {
                    return section.name;
                }
                return prefix + section.name + formatters.parameters(section, true);
            },
            signature(section) {
                let returns = '';
                let prefix = '';
                if (section.kind === 'class') {
                    prefix = 'new ';
                } else if (section.kind !== 'function') {
                    return section.name;
                }
                if (section.returns.length) {
                    returns = `: ${formatters.type(section.returns[0].type)}`;
                }
                return prefix + section.name + formatters.parameters(section) + returns;
            },
            md(ast, inline) {
                if (
                    inline &&
                    ast &&
                    ast.children.length &&
                    ast.children[0].type === 'paragraph'
                ) {
                    ast = {
                        type: 'root',
                        children: ast.children[0].children.concat(ast.children.slice(1)),
                    };
                }
                return formatters.markdown(ast);
            },
            formatType: formatters.type,
            autolink: formatters.autolink,
            highlight(example) {
                if (config.hljs && config.hljs.highlightAuto) {
                    return hljs.highlightAuto(example).value;
                }
                return hljs.highlight('js', example).value;
            },
        },
    };

    sharedImports.imports.renderSectionList = _.template(
        fs.readFileSync(path.join(__dirname, 'section_list._'), 'utf8'),
        sharedImports,
    );
    sharedImports.imports.renderSection = _.template(
        fs.readFileSync(path.join(__dirname, 'section._'), 'utf8'),
        sharedImports,
    );
    sharedImports.imports.renderNote = _.template(
        fs.readFileSync(path.join(__dirname, 'note._'), 'utf8'),
        sharedImports,
    );

    const pageTemplate = _.template(
        fs.readFileSync(path.join(__dirname, 'index._'), 'utf8'),
        sharedImports,
    );

    // push assets into the pipeline as well.
    return new Promise((resolve) => {
        vfs.src(
            [`${__dirname}/assets/**`],
            { base: __dirname },
        ).pipe(concat((files) => {
            resolve(files.concat(new File({
                path: 'index.html',
                contents: new Buffer(
                    pageTemplate({
                        docs: comments,
                        config,
                    }),
                    'utf8',
                ),
            })));
        }));
    });
};

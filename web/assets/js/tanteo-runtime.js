/* Tanteo · mini runtime de plantillas
   Soporta {{ruta}}, <sc-for list as>, <sc-if value>, onClick="{{fn}}" y setState. */
(function () {
  'use strict';

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next || {});
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var ONLY = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    var tag = node.localName;
    if (tag === 'sc-for') {
      var list = lookup((node.getAttribute('list') || '').replace(/[{}]/g, ''), scope) || [];
      var as = node.getAttribute('as') || 'item';
      for (var i = 0; i < list.length; i++) {
        var s = Object.create(scope); s[as] = list[i]; s.$index = i;
        for (var c = node.firstChild; c; c = c.nextSibling) build(c, s, out);
      }
      return;
    }
    if (tag === 'sc-if') {
      if (lookup((node.getAttribute('value') || '').replace(/[{}]/g, ''), scope)) {
        for (var d = node.firstChild; d; d = d.nextSibling) build(d, scope, out);
      }
      return;
    }
    var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(node.namespaceURI, node.nodeName)
      : document.createElement(tag);
    el.__h = {};
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      if (at.name.indexOf('hint-') === 0) continue;
      if (at.name.indexOf('on') === 0) {
        var m = ONLY.exec(at.value);
        if (m) { var fn = lookup(m[1], scope); if (typeof fn === 'function') el.__h[at.name.slice(2)] = fn; }
        continue;
      }
      el.setAttribute(at.name, interp(at.value, scope));
    }
    var kids = [];
    var src = tag === 'template' ? node.content : node;
    for (var k = src.firstChild; k; k = k.nextSibling) build(k, scope, kids);
    kids.forEach(function (x) { el.appendChild(x); });
    out.push(el);
  }

  function sameKind(a, b) {
    return a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.nodeName === b.nodeName && a.namespaceURI === b.namespaceURI));
  }
  function morph(parent, nodes) {
    for (var i = 0; i < nodes.length; i++) {
      var nu = nodes[i], old = parent.childNodes[i];
      if (!old) { parent.appendChild(nu); continue; }
      if (!sameKind(old, nu)) { parent.replaceChild(nu, old); continue; }
      if (nu.nodeType === 3) { if (old.nodeValue !== nu.nodeValue) old.nodeValue = nu.nodeValue; continue; }
      var j;
      for (j = old.attributes.length - 1; j >= 0; j--) {
        var n = old.attributes[j].name; if (!nu.hasAttribute(n)) old.removeAttribute(n);
      }
      for (j = 0; j < nu.attributes.length; j++) {
        var at = nu.attributes[j]; if (old.getAttribute(at.name) !== at.value) old.setAttribute(at.name, at.value);
      }
      if (old.localName === 'input' && nu.hasAttribute('value') && old.value !== nu.getAttribute('value') && document.activeElement !== old) old.value = nu.getAttribute('value');
      old.__h = nu.__h;
      morph(old, Array.prototype.slice.call(nu.childNodes));
    }
    while (parent.childNodes.length > nodes.length) parent.removeChild(parent.lastChild);
  }

  function mount(Component) {
    var tpl = document.getElementById('dc-tpl');
    var root = document.getElementById('dc-root');
    var comp = new Component({});
    var busy = false, again = false;
    function render() {
      if (busy) { again = true; return; }
      busy = true;
      do {
        again = false;
        var vals = comp.renderVals ? comp.renderVals() : {};
        var out = [];
        for (var n = tpl.content.firstChild; n; n = n.nextSibling) build(n, vals, out);
        morph(root, out);
      } while (again);
      busy = false;
    }
    comp.__render = render;
    ['click', 'input', 'change'].forEach(function (type) {
      root.addEventListener(type, function (e) {
        for (var t = e.target; t && t !== root; t = t.parentNode) {
          if (t.__h && t.__h[type]) { t.__h[type].call(t, e); return; }
        }
      });
    });
    render();
    if (comp.componentDidMount) comp.componentDidMount();
    window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });
  }
  window.TanteoDC = { mount: mount };
})();

"use strict";

var L = require('leaflet'),
    Marionette = require('../../shim/backbone.marionette'),
    App = require('../app'),
    modalModels = require('../core/modals/models'),
    modalViews = require('../core/modals/views'),
    utils = require('./utils'),
    errorTmpl = require('./templates/error.html'),
    formTmpl = require('./templates/form.html'),
    searchResultTmpl = require('./templates/searchResult.html'),
    cuahsiSearchResultTmpl = require('./templates/cuahsiSearchResult.html'),
    tabContentTmpl = require('./templates/tabContent.html'),
    tabPanelTmpl = require('./templates/tabPanel.html'),
    windowTmpl = require('./templates/window.html');

var ENTER_KEYCODE = 13,
    MAX_AREA_SQKM = 1500,
    CATALOG_RESULT_TEMPLATE = {
        cinergi: searchResultTmpl,
        hydroshare: searchResultTmpl,
        cuahsi: cuahsiSearchResultTmpl,
    };

var DataCatalogWindow = Marionette.LayoutView.extend({
    template: windowTmpl,
    className: 'data-catalog-window',

    ui: {
        introText: '.intro-text',
        tabs: '.output-tabs-wrapper'
    },

    regions: {
        formRegion: '.form-region',
        panelsRegion: '.tab-panels-region',
        contentsRegion: '.tab-contents-region'
    },

    childEvents: {
        'search': 'doSearch',
        'selectCatalog': 'onSelectCatalog'
    },

    collectionEvents: {
        'change:active, change:loading': 'updateMap'
    },

    onShow: function() {
        this.formRegion.show(new FormView({
            model: this.model
        }));
        this.panelsRegion.show(new TabPanelsView({
            collection: this.collection
        }));
        this.contentsRegion.show(new TabContentsView({
            collection: this.collection
        }));
    },

    getActiveCatalog: function() {
        return this.collection.findWhere({ active: true });
    },

    onSelectCatalog: function(childView, catalogId) {
        // Deactiveate previous catalog
        var prevCatalog = this.getActiveCatalog();
        if (prevCatalog && prevCatalog.id !== catalogId) {
            prevCatalog.set('active', false);
        }

        // Activate selected catalog
        var nextCatalog = this.collection.get(catalogId);
        nextCatalog.set('active', true);

        this.doSearch();
    },

    doSearch: function() {
        var catalog = this.getActiveCatalog(),
            query = this.model.get('query'),
            bounds = L.geoJson(App.map.get('areaOfInterest')).getBounds(),
            area = utils.areaOfBounds(bounds);

        // CUAHSI should not be fetched beyond a certain size
        if (catalog.get('id') === 'cuahsi' && area > MAX_AREA_SQKM) {
            var alertView = new modalViews.AlertView({
                model: new modalModels.AlertModel({
                    alertMessage: "The bounding box of the current area of " +
                                  "interest is " + Math.round(area) + " km², " +
                                  "which is larger than the current maximum " +
                                  "area of " + MAX_AREA_SQKM + " km² supported " +
                                  "for WDC.",
                    alertType: modalModels.AlertTypes.error
                })
            });
            alertView.render();

            // Reset results
            catalog.get('results').reset();
            catalog.set({ resultCount: 0 });
            this.updateMap();

            return;
        }

        // Disable intro text after first search request
        this.ui.introText.addClass('hide');
        this.ui.tabs.removeClass('hide');

        catalog.search(query, bounds);
    },

    updateMap: function() {
        var catalog = this.getActiveCatalog(),
            geoms = catalog.get('results').pluck('geom');
        App.map.set('dataCatalogResults', geoms);
    }
});

var FormView = Marionette.ItemView.extend({
    template: formTmpl,
    className: 'data-catalog-form',

    ui: {
        searchInput: '.data-catalog-search-input'
    },

    events: {
        'keyup @ui.searchInput': 'onSearchInputChanged'
    },

    onSearchInputChanged: function(e) {
        var query = this.ui.searchInput.val().trim();
        if (e.keyCode === ENTER_KEYCODE) {
            this.triggerMethod('search');
        } else {
            this.model.set('query', query);
        }
    }
});

var TabPanelView = Marionette.ItemView.extend({
    tagName: 'li',
    template: tabPanelTmpl,
    attributes: {
        role: 'presentation'
    },

    events: {
        'click a': 'onTabClicked'
    },

    modelEvents: {
        'change': 'render'
    },

    onTabClicked: function() {
        this.triggerMethod('selectCatalog', this.model.id);
    },

    onRender: function() {
        this.$el.toggleClass('active', this.model.get('active'));
    }
});

var TabPanelsView = Marionette.CollectionView.extend({
    tagName: 'ul',
    className: 'nav nav-tabs',
    attributes: {
        role: 'tablist'
    },
    childView: TabPanelView
});

var ErrorView = Marionette.ItemView.extend({
    template: errorTmpl,
    modelEvents: {
        'change:error': 'render',
    },
});

var TabContentView = Marionette.LayoutView.extend({
    className: function() {
        return 'tab-pane' + (this.model.get('active') ? ' active' : '');
    },
    id: function() {
        return this.model.id;
    },
    template: tabContentTmpl,
    attributes: {
        role: 'tabpanel'
    },

    ui: {
        noResults: '.no-results-panel'
    },

    regions: {
        resultRegion: '.result-region',
        errorRegion: '.error-region',
    },

    modelEvents: {
        'change': 'update'
    },

    onShow: function() {
        this.resultRegion.show(new ResultsView({
            collection: this.model.get('results'),
            catalog: this.model.id,
        }));

        this.errorRegion.show(new ErrorView({
            model: this.model,
        }));
    },

    update: function() {
        this.ui.noResults.addClass('hide');
        this.errorRegion.$el.addClass('hide');
        this.resultRegion.$el.addClass('hide');

        var error = this.model.get('error'),
            // Don't show "no results" while search request is in progress
            showNoResults = !this.model.get('loading') &&
                            this.model.get('resultCount') === 0 && !error;

        if (showNoResults) {
            this.ui.noResults.removeClass('hide');
        } else if (error) {
            this.errorRegion.$el.removeClass('hide');
        } else {
            this.resultRegion.$el.removeClass('hide');
        }
    }
});

var TabContentsView = Marionette.CollectionView.extend({
    className: 'tab-content',
    childView: TabContentView
});

var ResultView = Marionette.ItemView.extend({
    getTemplate: function() {
        return CATALOG_RESULT_TEMPLATE[this.options.catalog];
    },

    className: 'resource',

    events: {
        'mouseover': 'highlightResult'
    },

    highlightResult: function() {
        App.map.set('dataCatalogActiveResult', this.model.get('geom'));
    }
});

var ResultsView = Marionette.CollectionView.extend({
    childView: ResultView,

    childViewOptions: function() {
        return {
            catalog: this.options.catalog,
        };
    },

    modelEvents: {
        'sync error': 'render'
    }
});

module.exports = {
    DataCatalogWindow: DataCatalogWindow
};

"use strict";

var _ = require('lodash'),
    App = require('../app'),
    router = require('../router').router,
    views = require('./views'),
    modelingModels = require('../modeling/models.js');

var CompareController = {
    compare: function(projectId) {
        if (App.currProject) {
            setupProjectCopy();
            showCompareWindow();
        } else if (projectId) {
            App.currProject = new modelingModels.ProjectModel({
                id: projectId
            });
            App.currProject
                .fetch()
                .done(function() {
                    setupProjectCopy();
                    showCompareWindow();
                });
        }
        // else -- this case is caught by the backend and raises a 404
    },

    compareCleanUp: function() {
        App.user.off('change:guest', saveAfterLogin);
        App.origProject.off('change:id', updateUrl);

        // Switch back to the origProject so any changes are discarded.
        App.currProject.off();
        App.currProject = App.origProject;

        App.rootView.footerRegion.empty();
    }
};

function setupProjectCopy() {
    /*
    Create a copy of the project so that:
      -Changes to the results and inputs are not saved to the server
      -Changes to the results and inputs are not present after hitting the back button (and project is unsaved).
       When the user is logged in as a guest, the only copy of the original inputs and results
       are in App.currProject, and modifying these values in the compare views will result in those new
       values being back in the modeling views, which is not what we want.
      -The original project (without changes) is saved when logging in. If the user is a guest,
       goes into the compare views, and then logs in, the project should be saved with the inputs
       and results that were present before going to the compare views. This is to enforce the
       constraint that inputs and results entered in the compare views should never be saved.
       Without holding onto the original copies of these values, it's not possible to do this.
     */
    App.origProject = App.currProject;
    App.currProject = copyProject(App.origProject);

    App.user.on('change:guest', saveAfterLogin);
    App.origProject.on('change:id', updateUrl);
}

// Creates a special-purpose copy of the project
// for the compare views, since creating a true deep
// clone is more difficult and unnecessary.
function copyProject(project) {
    var scenariosCopy = new modelingModels.ScenariosCollection();
    project.get('scenarios').forEach(function(scenario) {
        var scenarioCopy = new modelingModels.ScenarioModel({});
        scenarioCopy.set({
            is_current_conditions: scenario.get('is_current_conditions'),
            modifications: scenario.get('modifications'),
            modification_hash: scenario.get('modification_hash'),
            results: new modelingModels.ResultCollection(scenario.get('results').toJSON()),
            inputs: new modelingModels.ModificationsCollection(scenario.get('inputs').toJSON()),
            inputmod_hash: scenario.get('inputmod_hash'),
            allow_save: false
        });
        scenarioCopy.get('inputs').on('add', _.debounce(_.bind(scenarioCopy.fetchResults, scenarioCopy), 500));
        scenariosCopy.add(scenarioCopy);
    });
    return new modelingModels.ProjectModel({
        name: App.origProject.get('name'),
        area_of_interest: App.origProject.get('area_of_interest'),
        model_package: App.origProject.get('model_package'),
        scenarios: scenariosCopy,
        allow_save: false
    });
}

function saveAfterLogin(user, guest) {
    if (!guest && App.origProject.isNew()) {
        var user_id = user.get('id');
        App.origProject.set('user_id', user_id);
        App.origProject.get('scenarios').each(function(scenario) {
            scenario.set('user_id', user_id);
        });
        // Save the origProject (as opposed to the currProject)
        // to not include changes to inputs and results.
        App.origProject.saveProjectAndScenarios();
    }
}

function updateUrl() {
    // Use replace: true, so that the back button will work as expected.
    router.navigate(App.origProject.getCompareUrl(), { replace: true });
}

function showCompareWindow() {
    var compareWindow = new views.CompareWindow({
            model: App.currProject
        });
    App.rootView.footerRegion.show(compareWindow);
}

module.exports = {
    CompareController: CompareController
};
import BeaconClient from '../shared/BeaconClient.js';
var $ = require('jquery');
global.jQuery = $;
var moment = require('moment');
import '../../styles/pages/nitcexport.css';

var params = getSearchParameters();

var token = params.token
var tokenexp = params.tokenexp

window.onerror = function(message, url, lineNumber) {
  document.getElementById("loading").style.visibility = 'visible';
  document.getElementById("loading").innerHTML = "Error loading page<br>"+message+" Line "+lineNumber;
  return true;
};

$(document).ready(function() {

  validateTokenExpiration();
  setInterval(validateTokenExpiration, 3e5);

})


document.addEventListener('DOMContentLoaded', function() {
  document.getElementById("goButton").addEventListener("click", function(){
    var mp = new Object();
    mp.setValue = function(value) { //value between 0 and 1
      $('#loadprogress').css('width', (Math.round(value * 100) + '%'));
      $('#loadprogress').text(Math.round(value * 100) + '%')
    }
    mp.open = function() {
      document.getElementById("loading").style.visibility = 'visible';
      $('#loadprogress').css('width', 1 + '%');
    }
    mp.fail = function() {
      $('#loadprogress').addClass('progress-bar-striped bg-danger');
      $('#loadprogress').text('Error Loading')
    }
    mp.close = function() {
      document.getElementById("loading").style.visibility = 'hidden';
    }
    RunForestRun(mp);
  });
});


function getSearchParameters() {
  var prmstr = window.location.search.substr(1);
  return prmstr != null && prmstr != "" ? transformToAssocArray(prmstr) : {};
}

function transformToAssocArray(prmstr) {
  var params = {};
  var prmarr = prmstr.split("&");
  for (var i = 0; i < prmarr.length; i++) {
    var tmparr = prmarr[i].split("=");
    params[tmparr[0]] = decodeURIComponent(tmparr[1]);
  }
  return params;
}


function validateTokenExpiration()
  {
    moment().isAfter(moment(tokenexp).subtract(5, "minutes")) && (console.log("token expiry triggered. time to renew."),
      $.ajax({
        type: 'GET'
        , url: params.source+"/Authorization/RefreshToken"
        , beforeSend: function(n) {
          n.setRequestHeader("Authorization", "Bearer " + token)
        }
        , cache: false
        , dataType: 'json'
        , complete: function(response) {
          token = response.responseJSON.access_token
          tokenexp = response.responseJSON.expires_at
          console.log("successful token renew.")
        }
      })
      )
  }

//Get times vars for the call
function RunForestRun(mp) {
  mp && mp.open();
  document.getElementById("loading").style.visibility = 'visible';
  HackTheMatrix(mp); // expand to include NonIncidentTypeIds, IncludeCompleted - params is global
}

//make the call to beacon
function HackTheMatrix(progressBar) {
  const start = new Date(decodeURIComponent(params.start));
  const end = new Date(decodeURIComponent(params.end));

  BeaconClient.nitc.search(params, start, end, {
    host: params.host,
    userId: params.userId,
    token,
    onProgress: function(val, total) {
      progressBar.setValue(total ? val / total : 0);
    }
  }).then(function(nitcs) {

    let exports;

    if (document.getElementById("Activity").checked) {
      // Activity list export
      exports = nitcs.results.map(function(d) {
        const rawSdate = new Date(d.StartDate);
        const rawEdate = new Date(d.EndDate);
        // Adjust UTC date returned by API to local display time
        const startDateFixed = new Date(
          rawSdate.getTime() + (rawSdate.getTimezoneOffset() * 60000)
        );
        const endDateFixed = new Date(
          rawEdate.getTime() + (rawEdate.getTimezoneOffset() * 60000)
        );
        const tags = d.Tags.map(function(t) {
          return t.Name;
        }).join(",");
        let numParticipants = 0;
        let totalHours = 0;
        let participants = "";
        d.Participants.forEach(function(p) {
          numParticipants++;
          const hours = parseFloat(
            (
              Math.abs(
                new Date(p.EndDate) - new Date(p.StartDate)
              ) / 36e5
            ).toFixed(2)
          );
          totalHours += hours;
          participants += `${p.Person.FullName}[${hours}] `;
        });

        // Assumes StartDate and EndDate are always populated
        // Null values will export as Invalid date
        return {
          Name: d.Name.replaceAll('#', ''),
          StartDate: moment(startDateFixed).format('YYYY-MM-DD HH:mm:ss'),
          EndDate: moment(endDateFixed).format('YYYY-MM-DD HH:mm:ss'),
          Unit: d.CreatedAt.Code,
          Tags: tags,
          TotalParticipants: numParticipants,
          TotalHours: totalHours,
          Participants: participants
        };
      });
    } else {
      // Member list export
      exports = [];
      const listOfActivities = [];
      nitcs.results.forEach(function(d) {
        const activities = d.Tags.map(function(t) {
          return t.Name;
        });
        d.Participants.forEach(function(p) {
          let i = 0;
          const name = p.Person.FullName;
          const hours = parseFloat(
            (
              Math.abs(
                new Date(p.EndDate) - new Date(p.StartDate)
              ) / 36e5
            ).toFixed(2)
          );
          if ((i = findInArr(exports, name)) === null) {
            exports.push({ Name: name });
            i = exports.length - 1;
          }
          activities.forEach(function(a) {
            if (typeof exports[i][a] === 'undefined') {
              exports[i][a] = hours;
            } else {
              exports[i][a] += hours;
            }
            if (typeof listOfActivities[a] === 'undefined') {
              listOfActivities.push(a);
            }
          });
        });
      });

      // Pad out activities so all members have same columns
      for (let i = 0; i < exports.length; i++) {
        listOfActivities.forEach(function(a) {
          if (typeof exports[i][a] === 'undefined') {
            exports[i][a] = 0;
          }
        });
      }
    }

    progressBar.setValue(1);
    progressBar.close();
    downloadCSV("LighthouseExport.csv", exports);

  }).catch(function(err) {

    console.error('NITC export fetch failed', err);
    alert(
      'Failed to fetch non-incident tasks for export. Your session may have expired.'
    );
    progressBar.close();
  });
}

function convertArrayOfObjectsToCSV(data) {
  var result, ctr, keys, columnDelimiter, lineDelimiter;

  if (data == null || !data.length) {
    return null;
  }

  columnDelimiter =  ',';
  lineDelimiter = '\n';

  keys = Object.keys(data[0]);

  result = '';
  result += keys.join(columnDelimiter);
  result += lineDelimiter;

  data.forEach(function(item) {
    keys.forEach(function(key, ctr) {
      if (ctr > 0) {
        result += columnDelimiter;
      }
      const value = String(item[key] ?? '')
        // Escape CSV quotes
        .replace(/"/g, '""');
      result += `"${value}"`;
    });
    result += lineDelimiter;
  });

  return result;
}

function downloadCSV(file,dataIn) {
  var csv = convertArrayOfObjectsToCSV(dataIn);
  if (csv == null)
    return;

  let filename = file;

  if (!csv.match(/^data:text\/csv/i)) {
    csv = 'data:text/csv;charset=utf-8,' + csv;
  }
  let data = encodeURI(csv);

  let link = document.createElement('a');
  link.setAttribute('href', data);
  link.setAttribute('download', filename);
  link.click();
}

function findInArr(arr,name) {
    for (var i = 0; i < arr.length; i++) {
        if (arr[i]['Name'] == name) {
            return i;
        }
    }
    return null;
}

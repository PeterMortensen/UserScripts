// ==UserScript==
// @name         Stack Exchange CV Request Generator
// @namespace    http://your.homepage/
// @version      1.1
// @description  This script generates formatted close vote requests and sends them to a specified chat room
// @author       @TinyGiant
// @match        http://*.stackoverflow.com/questions/*
// @match        http://*.stackexchange.com/questions/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// Usage:
//   This script works on *.stackexchange.com and *.stackoverflow.com
//   To open the reason prompt:
//      Press ctrl+shift+a or,
//      Or select [Send Request] from the [cv-pls] menu (located in the post menu)
//   Enter your reason into the prompt
//      Anything that is acceptable in chat is acceptable in the reason dialog.
//   Click [OK] or press enter on your keyboard to submit the request.
//   Clicking on the [X] or [Cancel] will cancel the request.
//   This script will send the request to the SO Close Vote Reviewers room.
//     To change this, select [Set Room] from the [cv-pls] menu.
//     Past the URL of the room you would like to send the requests to in the dialog.
//     This setting will be saved for the site that you set it on only.
//   Requests generated by this script will follow the following format:
//     [tag:cv-pls] reason [title](url) - [user](url) time


function with_jquery(f) {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.textContent = "(" + f.toString() + ")(jQuery)";
    document.body.appendChild(script);
}

with_jquery(function ($) {
    StackExchange.ready(function () {
        //// Self Updating Userscript, see https://gist.github.com/Benjol/874058
        // (the first line of this template _must_ be a comment!)
        var VERSION = '1.1';
        var URL = "https://rawgit.com/SO-Close-Vote-Reviewers/UserScripts/master/SECloseVoteRequestGenerator.user.js";

        if(window["SECloseVoteRequestGenerator_AutoUpdateCallback"]) {
            window["SECloseVoteRequestGenerator_AutoUpdateCallback"](VERSION);
            return;
        }
        CheckForNewVersion();

        // Split int based version number strings on dots, zero-pad the arrays to the same length and
        // compare them in order such that true is returned only if the proposted version is newer
        function isVersionNewer(proposed, current) {
            proposed = proposed.split(".");
            current = current.split(".");

            while (proposed.length < current.length) proposed.push("0");
            while (current.length < proposed.length) current.push("0");

            for (var i = 0; i < proposed.length; i++) {
                if (parseInt(proposed[i]) > parseInt(current[i])) {
                    return true;
                }
                if (parseInt(proposed[i]) < parseInt(current[i])) {
                    return false;
                }
            }

            return false;
        }

        function updateCheck(notifier,force) {
            window["SECloseVoteRequestGenerator_AutoUpdateCallback"] = function (newver) {
                if(isVersionNewer(newver, VERSION)) notifier(newver, VERSION, URL);
                else if(force) alert('No update found');
            }
            $("<script />").attr("src", URL).appendTo("head");
        }

        // Check to see if a new version has become available since last check
        // - only checks once a day
        // - does not check for first time visitors, shows them a welcome message instead
        // - called at the end of the main script if function exists
        function CheckForNewVersion(force) {
            var today = (new Date().setHours(0, 0, 0, 0));
            var LastUpdateCheckDay = GetStorage("LastUpdateCheckDay");
            if(LastUpdateCheckDay && LastUpdateCheckDay == today && !force) return false;
            console.log('Checking for updates');
            updateCheck(function (newver, oldver, install_url) {
                if(newver != GetStorage("LastVersionAcknowledged") || force) {
                    if(confirm('A new version (' + newver + ') of the Stack Exchange Close Vote Request Generator UserScript is now available. Update it now?'))
                        window.location.href = install_url;
                    else
                        SetStorage("LastVersionAcknowledged", newver);
                }
            }, force);
            SetStorage("LastUpdateCheckDay", today);
        }

        /* How does this work?
           1. The installed script loads first, and sets the local VERSION variable with the currently installed version number
           2. window["AutoReviewComments_AutoUpdateCallback"] is not defined, so this is skipped
           3. When updateCheck() is called, it defines window["AutoReviewComments_AutoUpdateCallback"], which retains the installed version number in VERSION (closure)
           4. updateCheck() then loads the external version of the script into the page header
           5. when the external version of the script loads, it defines its own local VERSION with the external (potentially new) version number
           6. window["AutoReviewComments_AutoUpdateCallback"] is now defined, so it is invoked, and the external version number is passed in
           7. if the external version number (ver) is greater than the installed version (VERSION), the notification is invoked
         */
        
        var prefix = "SECloseVoteRequestGenerator_"; //prefix to avoid clashes in localstorage
        //Wrap local storage access so that we avoid collisions with other scripts
        function GetStorage(key) { return localStorage[prefix + key]; }
        function SetStorage(key, val) { return localStorage[prefix + key] = val; }
        function RemoveStorage(key) { return localStorage.removeItem(prefix + key); }
        function ClearStorage(startsWith) {
            for(var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);
                if(key.indexOf(prefix + startsWith) == 0) localStorage.removeItem(key);
            }
        }

        function getRoom(room) {
            return /http:\/\/chat\.stack(overflow|exchange)\.com\/rooms\/(.*)\/.*/.exec(room);
        }

        var base = /(http:\/\/.*stack.*\.com)\/.*/.exec(location.href)[1];

        if(!GetStorage(base + 'room'))
            SetStorage(base + 'room', 'http://chat.stackoverflow.com/rooms/41570/so-close-vote-reviewers');

        var room = GetStorage(base + 'room');
        var roomURL = getRoom(room);


        var cvButton = $('<a href="javascript:void(0)" style="position:relative;display:inline-block">cv-pls</a>');
        var cvList = $('<dl style="display:none;position:absolute;white-space:nowrap;border:1px solid #eee;padding: 5px 10px;border-radius:3px;background:#FFF;box-shadow:0px 1px 5px -2px black"/>');
        var cvListRoom = $('<dd><a href="javascript:void(0)">Set target room</a>');
        var cvListSend = $('<dd><a href="javascript:void(0)">Send request</a>');
        var cvListUpdt = $('<dd><a href="javascript:void(0)">Check for updates</a>');
        var cvListSep = $('<dd style="border-bottom: 1px solid #eee;margin: 2.5px 0;"/>');
        cvList.append(cvListRoom);
        cvList.append(cvListSep.clone());
        cvList.append(cvListSend);
        cvList.append(cvListSep.clone());
        cvList.append(cvListUpdt);
        cvButton.append(cvList);

        $('#question .post-menu').append(cvButton);

        var cvRequest = function(e) {
            e.stopPropagation();
            if(!roomURL) {
                alert('Invalid room URL. Please set a valid room.');
                return false;
            }
            cvList.hide();
            var reason = window.prompt('Reason for closing'); 
            if(!reason) return false;
            var tit = '[' + $('#question-header h1 a').text() + '](' + base + $('#question .short-link').attr('href') + ')'; 
            var usr = '[' + $('#question .owner a').text() + '](' + base + $('#question .owner a').attr('href') + ')';
            var tim = $('#question .owner .relativetime').html();
            var result = '[tag:cv-pls] ' + reason + ' ' + tit + ' - ' + usr + ' ' + tim;
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'http://chat.stack' + roomURL[1] + '.com/rooms/' + roomURL[2],
                onload: function(response) {
                    var key = response.responseText.match(/hidden" value="([\dabcdef]{32})/);
                    if(!key) {
                        alert('Failed retrieving key, is the room URL valid?');
                        return false;
                    }
                    GM_xmlhttpRequest({
                        synchronous: true,
                        method: 'POST',
                        url: 'http://chat.stack' + roomURL[1] + '.com/chats/' + roomURL[2] + '/messages/new',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                        data: 'text=' + encodeURIComponent(result) + '&fkey=' + key[1],
                        onload: function() {
                            alert('Close vote request sent.');
                        },
                        onerror: function(response) {
                            alert('Close vote request failed to send.');
                        }
                    });
                },
                onerror: function(response) {
                    alert('Close vote request failed to send.');
                }
            });
        }

        $(document).on('click',function(e){
            if(cvList.is(':visible'))
                cvList.hide();
        });
        $('a').not(cvButton).click(function(e){
            if(cvList.is(':visible')) cvList.hide();
        })
        cvButton.on('click', function(e){
            e.stopPropagation();
            cvList.toggle();
        })
        cvListRoom.on('click', function(){
            cvList.hide();
            response = window.prompt('Paste the URL of the room.', room);
            if(!response) return false;
            var roomURLt = getRoom(response);
            if(!roomURLt) {
                alert('Invalid room URL. Please set a valid room.');
                return false;
            }
            roomURL = roomURLt;
            SetStorage(base + 'room', room = response);
        });
        cvListSend.on('click', cvRequest);
        cvListUpdt.on('click', function(e){
            e.stopPropagation();
            cvList.hide();
            CheckForNewVersion(true);
        });
        $(document).keydown(function(e) {
            if(e.ctrlKey && e.shiftKey && e.which === 65)
                cvRequest(e);
        });
    });
});
var retainValue = function (value) {
    return value.toFixed(2);
};
moment.relativeTimeRounding(retainValue);

var isFullLoaded = false;
var data = {};
var cardsActions = {};

var GetActions = function(id){
    if(!(id in cardsActions)){
        cardsActions[id] = Trello.get(
                                        '/cards/' + id + '/actions/?fields=id,data,date,type&filter=createCard,updateCard,commentCard'
                                    )
    }
    else{
        cardsActions[id].concat(
            Trello.get(
                '/cards/' + id + '/actions/?fields=id,data,date,type&filter=createCard,updateCard,commentCard&actions_since=${cardsActions[id].slice(-1)[0].date}'
            )
        )    
    }
    return cardsActions[id];
}

var myregexp = /^([-+])?(\b[0-9]*\.?[0-9]+\b)/;
var calcComments = function(actions) {
    return _(actions)
        .filter(function (item){
            return item.type == 'commentCard' && (myregexp.test(item.data.text)) 
        })
        .map(function(item){
            var match = myregexp.exec(item.data.text);
            item.total = (match[1] =='+' ) ? parseFloat(match[2]) : - parseFloat(match[2]); 
            return item.total
        })
        .reduce(function(r, v) {
            var total = r + v;
            return total   
        }) * 3600000
}

var calcWorkLog = function(plistname, actions) {

    return _(actions)
        .filter(function (item) {
            return item.type == 'createCard' || item.type == 'updateCard'
        })
        .map(function (item) {
            item.ts = (+new Date(item.date));

            return item
        })
        .orderBy(['ts'], ['asc'])
        .map(function (v) {
            v.tracked = false;
            v.list = function(opt) {
                if (opt.list) {
                    return opt.list.name
                }
                if (opt.listAfter) {
                    return opt.listAfter.name
                }
                return ""
            }(v.data)

            if (v.list == plistname) {
                v.tracked = true
            }

            return {
                list: v.list,
                date: v.date,
                tracked: v.tracked,
                total: 0
            };
        })
        .reduce(function(r, v) {
            var total = r.total || 0;
            if (r.tracked) {
                total += ((new Date(v.date)) - (new Date(r.date)))
            }

            return {
                total: total,
                date: v.date,
                tracked: v.tracked
            }
        })
}
var Promise = TrelloPowerUp.Promise;
var getBadges = function (t, jQuery) {
    if(Trello.token() == null){
        return [{
                dynamic: function () {
                    return {
                        title: 'Time tracked', // for detail badges only
                        text: 'Waiting for authorization',
                        icon: './img/timer.svg', // for card front badges only
                        // color: 'green',
                        refresh: 10
                    }
                }
            }]
    }
    return t
        .card('id', 'name', 'shortLink')
        .then(function(ctx) {
            var key = 'card-'+ctx.id+'-estemite';
            return Promise.all([
                t.get('board', 'shared', key),
                GetActions(ctx.id),
                ctx.id,
                t.get('board', 'shared', 'progressListName')
            ])
        })
        .spread(function (estemite, actions, cardID, plistname) {
            var res = calcWorkLog(plistname, actions);
            var total = 0;
            var isInProgress = false;
            var lastDate = 0;

            var comments = calcComments(actions);

            if (res) {
                total = res.total;
                isInProgress = res.tracked;
                lastDate = res.date;
            }

            if(comments){
                total += comments;
            }

            var estemiteSuffix = "";

            if (estemite && estemite>0) {
                estemiteSuffix += ' / ' + moment
                    .duration(~~estemite, "hours")
                    .format('d [d] h [h]');
            }

            if (!isInProgress) {
                return function(){
                    var duration = moment.duration(total, "milliseconds");
                    var format = (duration.asMinutes() > 0 ? 'd [d] h [h] m [m]' : 's [s]');
                    var title = duration.format(format);

                    if (estemiteSuffix.length > 0) {
                        title += estemiteSuffix
                    }

                    return title;
                }
            }

            lastDate = (new Date(lastDate)) - total;

            return function() {
                total = ((new Date()) - (new Date(lastDate)));

                var duration = moment.duration(total, "milliseconds");
                var format = (duration.asMinutes() > 0 ? 'd [d] h [h] m [m]' : 's [s]');
                var title = duration.format(format);

                if (estemiteSuffix.length > 0) {
                    title += estemiteSuffix
                }

                return title
            }
        })
        .then(function (title) {
            return [{
                dynamic: function () {
                    return {
                        title: 'Time tracker', // for detail badges only
                        text: title(),
                        icon: './img/timer.svg', // for card front badges only
                        // color: 'green',
                        refresh: 60
                    }
                }
            }]
        })
};

var authenticationSuccess = function (res) 
{ 
    console.log('Successful authentication', res, this); 
    console.log('token:', localStorage.getItem("token"));
};

var authenticationFailure = function () 
{ 
    console.log('Failed authentication');
};

Trello.authorize({
    type: 'popup',
    name: 'Request access to TrelloAPI for TimeTracker',
    scope: {
        read: 'true',
        write: 'true'
    },
    expiration: 'never',
    success: authenticationSuccess,
    error: authenticationFailure
});

var cardButtonCallback = function(t){
  return t.popup({
      title: 'Time estimate',
      url: './estimate.html',
      height: 200
    });
};

TrelloPowerUp.initialize({
    'show-settings': function (t, options) {
        return t.popup({
            title: 'Settings',
            url: './settings.html',
            height: 184
        });
    },
    'card-badges': function (t, options) {
        return getBadges(t);
    },
    'card-detail-badges': function (t, options) {
        return getBadges(t);
    },
    'card-buttons': function(t) {
        return [{
            text: 'Estimate',
            callback: cardButtonCallback
        }]
    },
    'authorization-status': (function (t) {
        return new TrelloPowerUp.Promise(function (resolve) {
            console.log('authorization-status')
            return resolve({ authorized: false });
        });
    }),
    'show-authorization': function(t) {
        return t.popup({
            title: 'My Auth Popup',
            url: 'authorize.html',
            height: 240,
        })
    }
})
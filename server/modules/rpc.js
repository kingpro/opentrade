'use strict';

const utils = require("../utils.js");
const g_constants = require("../constants.js");
const url = require('url');

function send(coin, command, params, callback)
{
    if (command == 'dumpprivkey' || command == 'dumpwallet' || command == 'backupwallet')
        return callback({result: false, message: 'Forbidden command'});

    const p = 'string' != (typeof params) ? JSON.stringify(params) : params;//JSON.stringify(params).substr(1, JSON.stringify(params).length-2);
    const strJSON = '{"jsonrpc": "1.0", "id":"curltest", "method": "'+command+'", "params": '+p+' }';
    
    const user = utils.Decrypt(coin.rpc_user);
    const password = utils.Decrypt(coin.rpc_password);
    const headers = {
        'Content-Type': 'text/plain', 
        'Authorization': 'Basic ' + new Buffer(user + ':' + password).toString('base64')
    }

    const address = utils.Decrypt(coin.address);
    
    const parsed = url.parse(address, true);
    
    console.log('rpcPostJSON ' + strJSON);
    utils.postString(parsed.hostname, {'nPort' : parsed.port, 'name' : parsed.protocol}, "/", headers, strJSON, result =>
    {
        if (result.data) {
            try {
                if (result.success)
                    result.data = JSON.parse(result.data);
                if (result.data.error && result.data.error.message)
                    result['message'] = result.data.error.message+"<br>";
                    
                if (!result.data['error'] && result.data['result'] != undefined)
                    result.data = result.data.result;
                else
                    result['success'] = false; 
            }
            catch(e) {
                console.log('rpcPostJSON: '+e.message);
                result['message'] = 'RPC catch unecpected error';
            }
        }
        else {
            result['success'] = false;
            result['message'] = 'coin RPC is not returned data'
        }

        const ret = result.success ? 
                    {result: result.success, message: result.message || "", data: result.data} :
                    {result: result.success, message: result.message || "", data: result.message || ""};
        
        console.log('rpcPostJSON: result:' + ret.result + " (message: " + (result.message || "")+" )");
        return setTimeout(callback, 1, ret);
    });
}

exports.send2 = function(userID, coin, command, params, callback)
{
    g_constants.dbTables['coins'].selectAll('ROWID AS id', 'name="'+coin+'"', '', (err, rows) => {
        if (err || !rows || !rows.length)
            return callback({result: false, message: 'Coin not found'});

        exports.send3(userID, rows[0].id, command, params, callback);
    });
}

let bWaitCoin = {};
exports.send3 = function(userID, coinID, command, params, callback, counter)
{
    if (command == 'move' && params[2]*1 <= 0)
        return callback({result: false, message: 'Invalid move amount'});
    
    const count = counter || 0;
    
    if (count > 10)
    {
        console.log('Coin '+coinID+' not responce. (counter > 10 sec) command='+command);
        return setTimeout(callback, 1, {result: false, message: 'Coin RPC is not responded after 10 sec. Try later. '});
    }
    
    if (bWaitCoin[coinID] && bWaitCoin[coinID].status && bWaitCoin[coinID].status == true)
    {
        if (bWaitCoin[coinID].time > Date.now() + 5000)
        {
            console.log('Coin '+coinID+' not responce. delta='+(bWaitCoin[coinID].time - (Date.now()+5000))/1000 +' last_command='+bWaitCoin[coinID].last_command);
            return setTimeout(callback, 1, {result: false, message: 'Coin RPC is not responded. Try later.'+ ' '+ 'Coin '+coinID+' not responce. delta='+(bWaitCoin[coinID].time - (Date.now()+5000))/1000+' last_command='+bWaitCoin[coinID].last_command});
        }
        if (count == 0) console.log('Wait coin '+coinID+' RPC queue. command='+command)
        
        return setTimeout(exports.send3, 1000, userID, coinID, command, params, callback, count+1);
    }
    console.log('Coin '+coinID+' started RPC command='+command+" user="+userID);
    bWaitCoin[coinID] = {status: true, time: Date.now(), last_command: command};
    
    try
    {
        g_constants.dbTables['coins'].selectAll('*', 'ROWID="'+coinID+'"', '', (err, rows) => {
            if (err || !rows || !rows.length)
            {
                bWaitCoin[coinID] = {status: false, time: Date.now()};
                return callback({result: false, message: 'Coin not found'});
            }
            send(rows[0], command, params, ret => {
                bWaitCoin[coinID] = {status: false, time: Date.now()};
                return setTimeout(callback, 100, ret);
            });
        });
    }
    catch(e)
    {
        bWaitCoin[coinID] = {status: false, time: Date.now()};
        return callback({result: false, message: 'Unexpected RPC error'});
    }
}
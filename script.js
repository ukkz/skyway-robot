'use strict';

const CONTROLLER_PREFIX = 'controller-';

// Get Parametersを取得する
function getQueryParams() {
    if (1 < document.location.search.length) {
        const query = document.location.search.substring(1);
        const params = query.split('&');

        const result = {};
        for(var param of params) {
            const element = param.split('=');
            const key = decodeURIComponent(element[0]);
            const value = decodeURIComponent(element[1]);
            result[key] = value;
        }
        return result;
    }
    return null;
}

window.onload = ()=> {
    const query = getQueryParams();
    const key = query["apikey"];
    const my_peer_id = CONTROLLER_PREFIX + Math.floor(Math.random()*10000).toString().padStart(4,'0')
    const peer = new Peer(my_peer_id, {
        key: key,
        debug: 2
    });

    // ここではシグナリングサーバへの接続で発火
    peer.on('open', (my_peer_id) => {
        console.log('My Peer ID: ' + my_peer_id);
        // SkyWay Serverに自分のapi keyで繋いでいるユーザ一覧を取得
        peer.listAllPeers(peers => {
            let robots = [];
            peers.forEach(peer => {
                // コントローラ以外のPeerIDをロボットであると判断する
                if (peer.indexOf(CONTROLLER_PREFIX) === -1) {
                    const buttonHTML = '<button class="btn btn-outline-primary connect_to_robot" value="'+peer+'">'+peer+'</button>';
                    $('#robot_panel').append(buttonHTML);
                    robots.push(peer);
                }
            });
            // もしロボットが1台もなければ無効ボタンを表示
            if (robots.length === 0) {
                $('#robot_panel').append('<button class="btn btn-outline-danger" disabled>No robots connected</button>');
            }
        });
    });
    peer.on('error', (err) => alert(err.message));

    // 各ロボットボタンをクリック
    $(document).on('click', '.connect_to_robot', (b) => {
        b.preventDefault();
        const robot_id = $(b.currentTarget).val();

        // MediaConnection
        const mediaConnection = peer.call(
            robot_id, // 接続先
            null,     // 映像受信専用としてストリームを開く
            { videoReceiveEnabled: true }
        );

        // MediaStreamを受信、ビデオオブジェクトに反映
        mediaConnection.on('stream', (stream) => {
            document.getElementById("remote_video").srcObject = stream;
            $('#robot_panel').empty();
            $('#robot_panel').html('<h2>'+robot_id+'</h2>')
            // リロードボタン
            $('#robot_panel').append('<button class="btn btn-outline-info" onclick="javascript:location.reload();">Disconnect</button>');
            // 再起動ボタン
            $('#robot_panel').append('<button class="btn btn-outline-warning" id="reboot">Reboot</button>');
            // シャットダウンボタン設置
            $('#robot_panel').append('<button class="btn btn-outline-danger" id="shutdown">Shutdown</button>');
        });

        // MediaStream切断
        mediaConnection.on('close', () => {
            location.reload();
        });

        // DataConnection
        const dataConnection = peer.connect(
            robot_id, // 接続先
            { serialization: "none" }
        );

        // DataStream切断
        dataConnection.on('close', () => {
            location.reload();
        });

        // データが送られてきたらコンソールに表示
        dataConnection.on('data', (data) => {
            console.log(data)
        });

        // 再起動ボタン
        $(document).on('click', '#reboot', () => {
            dataConnection.send('#reboot');
            $('#robot_panel').empty();
            $('#robot_panel').append('<button class="btn btn-outline-warning" disabled>Sent reboot command.</button>');
            setTimeout(() => {
                location.reload();
            }, 1000);
        });

        // シャットダウンボタン
        $(document).on('click', '#shutdown', () => {
            dataConnection.send('#shutdown');
            $('#robot_panel').empty();
            $('#robot_panel').append('<button class="btn btn-outline-danger" disabled>Sent shutdown command.</button>');
            setTimeout(() => {
                location.reload();
            }, 1000);
        });

        // ボタンによる操作
        $('.controller').on('click', (e) => {
            e.preventDefault();
            const command = $(e.currentTarget).val();
            console.log('Command:', command);
            dataConnection.send(command);
        });

        // キーボードによる操作
        $(document).keydown(() => {
            const keyCode = event.keyCode;
            if (keyCode == '87') dataConnection.send('#go');    // W
            //if (keyCode == '87') dataConnection.send('100/100');    // W
            if (keyCode == '65') dataConnection.send('#left');  // A
            if (keyCode == '83') dataConnection.send('#back');  // S
            if (keyCode == '68') dataConnection.send('#right'); // D
        });
        $(document).keyup(() => {
            dataConnection.send('#stop');
        });

        // 画面ジョイスティック
        const nipple = nipplejs.create({
            zone: document.getElementById('joypad'),
            catchDistance: 150,
            size: 200,
            color: 'orange',
            mode: 'semi'
        });

        nipple.on('added', (evt, joystick) => {
            let stepL = 0, stepR = 0;
            joystick.on('move', (evt) => {
                const X = Math.round(joystick.frontPosition.x/5)*5;
                const Y = -1 * Math.round(joystick.frontPosition.y/5)*5;
                const motorL = X + Y;
                const motorR = Y - X;
                if (motorL != stepL || motorR != stepR) {
                    console.log('L:', motorL, 'R:', motorR);
                    stepL = motorL;
                    stepR = motorR;
                    dataConnection.send(stepL+'/'+stepR);
                }
            });
            joystick.on('end', () => {
                // ストップ
                console.log('STOP');
                dataConnection.send('#stop');
            });
        });
    });
};
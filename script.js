'use strict';

const CONTROLLER_PREFIX = 'controller-';
const SPEED_STEP = 5;

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
    const my_peer_id = CONTROLLER_PREFIX + Math.floor(Math.random()*10000).toString().padStart(4,'0');
    const peer = new Peer(my_peer_id, {
        key: key,
        debug: 3
    });
    // 同じスピードの場合は記録しておき
    // 重複してコマンドが送られないようにする
    let last_speed_L = 0;
    let last_speed_R = 0;

    // LeapMotion定義
    const leapController = new Leap.Controller({
        enableGestures: true,
        frameEventName: 'animationFrame'
    });
    let hand_in = false; // 手を検出しているかしていないかのフラグ

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
            // リロードボタン
            $('#robot_panel').append('<button class="btn btn-outline-info" onclick="javascript:location.reload();">Reload</button>');
        });
    });
    peer.on('error', (err) => alert(err.message));

    // 各ロボットボタンをクリック
    $(document).on('click', '.connect_to_robot', (b) => {
        b.preventDefault();
        const robot_id = $(b.currentTarget).val();

        // オーバーレイの数値などを表示（最初は非表示）
        $('#joypad').removeClass('d-none');

        // MediaConnection
        const mediaConnection = peer.call(
            robot_id, // 接続先
            null,     // 映像受信専用としてストリームを開く
            {
                videoReceiveEnabled: true,
                videoBandwidth: 512
            }
        );

        // MediaStreamを受信、ビデオオブジェクトに反映
        mediaConnection.on('stream', (stream) => {
            document.getElementById("remote_video").srcObject = stream;
            $('#robot_panel').empty();
            $('#robot_panel').html('<h2>'+robot_id+'</h2>')
            // リロードボタン
            $('#robot_panel').append('<button class="btn btn-outline-info" id="reload">Disconnect</button>');
            // 再起動ボタン
            $('#robot_panel').append('<button class="btn btn-outline-warning" id="reboot">Reboot</button>');
            // シャットダウンボタン
            $('#robot_panel').append('<button class="btn btn-outline-danger" id="shutdown">Shutdown</button>');
        });

        // MediaStream切断されたらリロード
        mediaConnection.on('close', () => {
            location.reload();
        });

        // DataConnection
        const dataConnection = peer.connect(
            robot_id, // 接続先
            { serialization: "none" }
        );

        // DataStream切断されたらリロード
        dataConnection.on('close', () => {
            location.reload();
        });

        // データが送られてきたらコンソールに表示
        dataConnection.on('data', (data) => {
            console.log(data)
        });

        // ラジコン制御コマンド：スピード
        const robotSpeed = (left, right) => {
            left  = Math.round(left/SPEED_STEP)*SPEED_STEP;
            right = Math.round(right/SPEED_STEP)*SPEED_STEP;
            if (left != last_speed_L || right != last_speed_R) {
                dataConnection.send(left + '/' + right);
                console.log('L:', left, 'R:', right);
                $('#display_speed').text((left+right)/10);
                $('#display_rotation').text(270*(left-right)/200);
            }
            last_speed_L = left;
            last_speed_R = right;
        }

        // ラジコン制御コマンド：固定値
        const robotCommand = (command) => {
            if (command === 'go') robotSpeed(50, 50);
            else if (command === 'left') robotSpeed(-25, 25);
            else if (command === 'back') robotSpeed(-50, -50);
            else if (command === 'right') robotSpeed(25, -25);
            else if (command === 'stop') robotSpeed(0, 0);
            else dataConnection.send(command);
        }

        // リロードボタン
        $(document).on('click', '#reload', () => {
            // ちゃんとコネクションを切断
            mediaConnection.close();
            dataConnection.close();
            $('#robot_panel').empty();
            $('#robot_panel').append('<button class="btn btn-outline-info" disabled>Disconnecting...</button>');
            // close() で自動リロードされる
        });

        // 再起動ボタン
        $(document).on('click', '#reboot', () => {
            robotCommand('#reboot');
            $('#robot_panel').empty();
            $('#robot_panel').append('<button class="btn btn-outline-warning" disabled>Sent reboot command.</button>');
            setTimeout(() => {
                location.reload();
            }, 2000);
        });

        // シャットダウンボタン
        $(document).on('click', '#shutdown', () => {
            robotCommand('#shutdown');
            $('#robot_panel').empty();
            $('#robot_panel').append('<button class="btn btn-outline-danger" disabled>Sent shutdown command.</button>');
            setTimeout(() => {
                location.reload();
            }, 2000);
        });

        // ボタンによる操作
        $('.controller').on('click', (e) => {
            e.preventDefault();
            const command = $(e.currentTarget).val();
            console.log('Command:', command);
            robotCommand(command);
        });

        // キーボードによる操作
        $(document).keydown(() => {
            const keyCode = event.keyCode;
            console.log(keyCode);
            if (keyCode == '87') robotCommand('go');    // W
            if (keyCode == '65') robotCommand('left');  // A
            if (keyCode == '83') robotCommand('back');  // S
            if (keyCode == '68') robotCommand('right'); // D
            if (keyCode == '38') robotCommand('go');    // Arrow-Up
            if (keyCode == '37') robotCommand('left');  // Arrow-Left
            if (keyCode == '40') robotCommand('back');  // Arrow-Down
            if (keyCode == '39') robotCommand('right'); // Arrow-Right
        });
        $(document).keyup(() => {
            robotCommand('stop');
        });

        // ジョイスティック & LeapMotion
        // 回転しすぎを防ぐための係数
        const joy_roll_coef = 0.2;
        const leap_roll_coef = 0.5;

        // 画面ジョイスティック
        const nipple = nipplejs.create({
            zone: document.getElementById('joypad'),
            catchDistance: 50,
            size: 150,
            color: 'yellow',
            mode: 'semi'
        });
        nipple.on('added', (e, joystick) => {
            joystick.on('move', () => {
                const X = joystick.frontPosition.x * joy_roll_coef;
                const Y = -1 * joystick.frontPosition.y;
                robotSpeed(X + Y, Y - X);
            });
            joystick.on('end', () => {
                robotCommand('stop'); // ストップ
            });
        });

        // LeapMotion反応したとき
        leapController.on('frame', (frame) => {
            // 認識されたHandオブジェクト
            // 複数認識できるが最初の一つだけにしておく（index=0）
            // 以下は1つ以上手を検出したときのみ
            if (frame.hands.length > 0) {
                if (!hand_in) {
                    // 手を未検出->検出中の瞬間のみ
                    $('#display_leapmotion').text('Detect');
                }
                hand_in = true;
                const hand = frame.hands[0];
                const ahead = -100 * hand.pitch();
                let L = ahead, R = ahead;
                const roll = hand.roll();
                if (roll > 0) L = L * (1 - (roll * leap_roll_coef));
                if (roll < 0) R = R * (1 + (roll * leap_roll_coef));
                robotSpeed(L, R);
            } else {
                if (hand_in) {
                    // 手を検出中->未検出の瞬間のみ
                    robotCommand('stop');
                    $('#display_leapmotion').text('None');
                }
                hand_in = false;
            }
            //gestureCountDisplay.innerText = frame.gestures.length;    
        });
        leapController.connect();
    });
};
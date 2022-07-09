import {Server} from 'socket.io';
import {SECONDS_TIMER_BEFORE_START_GAME} from "./config";

interface IMember {
	username: string,
	isReady: boolean
}

interface IRoom {
	name: string,
	members: IMember[],
	winners?: string[]
}
let rooms: IRoom[] = [];

export default (io: Server) => {
	let users: string[] = [];
	io.on('connection', socket => {
		const username: string = (socket.handshake.query.username as string);
		!users.includes(username)
			? users.push(username)
			: socket.emit('error_username', 'error');
		socket.emit('get_rooms', rooms);
		socket.join('lobby');
		socket.on('add_room', (room: string) => {
			if (rooms.find(item => item.name === room)) {
				return;
			}
			rooms.push({name: room, members: [{username, isReady: false}]});
			io.sockets.in('lobby').emit('add_room', {name: room, members: [username]});
			const index = rooms.findIndex(item => item.name === room);
			io.to(socket.id).emit('join_room_done', { room : rooms[index] });
			io.to(socket.id).emit('refresh_room_info', { room : rooms[index] });
			socket.join(room);
			socket.leave('lobby');
		})

		socket.on('join_room', roomName => {
			rooms.forEach(item => item.members = item.members.filter(member => member.username !== username));
			const index = rooms.findIndex(room => room.name === roomName);
			if (rooms[index].members.length<5) {
				rooms[index].members.push({username, isReady: false});
				socket.join(roomName);
				socket.leave('lobby');
				io.to(socket.id).emit('join_room_done', {room: rooms[index]})
				io.emit('refresh_room_info', {room: rooms[index]});
			}
		})

		socket.on('change_state', (roomName: string) => {
			const index = rooms.findIndex(room => room.name === roomName);
			if (index>=0) rooms[index].members = rooms[index].members.map(member => member.username !== username ? member : {
				...member,
				isReady : !member.isReady
			});
			const changedUser = rooms[index].members.find(item => item.username === username);
			io.sockets.in(roomName).emit('change_state_done', changedUser);
			if(rooms[index].members.filter(item => item.isReady)?.length === rooms[index].members.length && rooms[index].members.length >= 2) {
				io.sockets.in(roomName).emit('timer_render');
			}
		});

		socket.on('check_if_ready', roomName => {
			const index = rooms.findIndex(room => room.name === roomName);
			if(index!==-1 && rooms[index]?.members?.filter(item => item.isReady)?.length === rooms[index]?.members?.length && rooms[index].members?.length >= 2) {
				io.sockets.in(roomName).emit('timer_render');
			}
		})

		socket.on('start_timer', (roomName: string) => {
			io.sockets.in('lobby').emit('hide_room', roomName);
			let timer = SECONDS_TIMER_BEFORE_START_GAME;
			function intervalTimer (this: any) {
				io.to(socket.id).emit('start_timer_count', timer--);
				if(timer < 0)
					clearInterval(this);
			}
			setInterval(intervalTimer, 1000);
		})

		socket.on('leave_room', roomName => {
			const index = rooms.findIndex(room => room.name === roomName);
			rooms[index].members = rooms[index].members?.filter(member => member.username !== username)
			io.to(socket.id).emit('leave_room_done', { room : rooms[index] });
			socket.leave(roomName);
			socket.join('lobby');
			if(rooms[index].members.length>=1){
				io.in(roomName).in('lobby').emit('refresh_room_info', { room : rooms[index] });
			}
			else {
				rooms = rooms.filter(item => item.members.length > 0);
				io.sockets.in('lobby').emit('get_rooms', rooms)
			}
		})

		socket.on('choose_id', roomName =>{
			const rndInt = Math.floor(Math.random() * 7);
			io.sockets.in(roomName).volatile.emit('generated_id', rndInt);
		});

		socket.on('pressed_key', (props) => {
			io.sockets.in(props.roomName).emit('change_progressBar', {username, progress: props.percentage})
		});

		socket.on('finished_game', (roomName: string) => {
			const index = rooms.findIndex(room => room.name === roomName);
			if(rooms[index].winners) {
				rooms[index]?.winners?.push(username);
			}
			else {
				rooms[index].winners = [username]
			}
			console.log(rooms[index]?.winners?.length)
			console.log(rooms[index]?.members?.length)
			if(rooms[index]?.winners?.length === rooms[index]?.members?.length) {
				io.sockets.in(roomName).emit('show_result', rooms[index]?.winners);
			}
		})

		socket.on('test_emit', () => console.log('success'))

		socket.on('disconnect', () => {
			const username: string = (socket.handshake.query.username as string);
			rooms.forEach(item => item.members = item.members.filter(member => member.username !== username));
			rooms = rooms.filter(item => item.members.length > 0);
			users = users.filter(item => item !== username);
			io.sockets.in('lobby').emit('get_rooms', rooms)
		})
	});
};

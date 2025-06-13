boat_width = 30; // in pixels
boat_length = 60; // in pixels
boat_colour = "#ffffff"
gunwale_colour  = "#000000"
tiller_colour = "#000000"
sail_colour = "#0000ff"
scale = 1;
boat_points = {
    "bow": [0, boat_length / 2.0],
    "port_stern": [-boat_width * 0.5, -boat_length / 2.0],
    "starboard_stern": [boat_width * 0.5, -boat_length / 2.0],
    "mast": [0, boat_length * (1.5 / 3.0) / 2.0],
    "clew": [0, -boat_length / 2.0],
    "stern": [0, -boat_length / 2.0],
    "tiller_tip": [0, -(1.5 / 5.0) * boat_length],
    "rudder_tip": [0, -(3.0 / 5.0) * boat_length]
};

arrow_points = {
    "tip": [0, 0.6*boat_length],
    "tail": [0, 0],
    "left": [-boat_width*0.5, -0.4*boat_length],
    "right": [boat_width*0.5, -0.4*boat_length]
}


class Boat{
    constructor(x, y, bearing, sail_angle, rudder_angle, rudder_area, keel_area, mass) {
        this.bearing = bearing % 360; // 0 to 360
        this.sail_angle = sail_angle; // -90 to 90
        this.rudder_angle = rudder_angle;
        this.rudder_area = rudder_area;
        this.keel_area = keel_area;
        this.mass = mass;
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;
        this.dx2 = 0;
        this.d2y = 0;
        this.rudder_step = 5;
        this.sail_step = 5;
        self.addEventListener('keydown', (event) => {
            const key = event.code; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"
            const callback = {
                "KeyA"  : this.leftHandler.bind(this),
                "KeyD" : this.rightHandler.bind(this),
                "KeyW"    : this.upHandler.bind(this),
                "KeyS"  : this.downHandler.bind(this),
            }[key];
            console.log(callback);
            callback?.()
        });
    }

    leftHandler(){
        this.rudder_angle -= this.rudder_step;
        console.log("left")
    }
    rightHandler(){
        this.rudder_angle += this.rudder_step;
    }
    upHandler(){
        this.sail_angle -= this.sail_step;
    }
    downHandler(){
        this.sail_angle += this.sail_step;
    }

    update_acceleration(wind_direction, wind_speed){
        return true;
    }

    update_position(delta_time){
        // use x = ut + 0.5at^2 to find new position
        this.x += this.dx*delta_time + 0.5*this.dx2*delta_time*delta_time;
        this.y += this.dy*delta_time + 0.5*this.d2y*delta_time*delta_time;
    }

    calculate_wind_force(wind_bearing, wind_speed){
        let apparent_dx = wind_speed * Math.sin(Math.PI * 2 * wind_bearing/360) - this.dx;
        let apparent_dy = wind_speed * Math.cos(Math.PI * 2 * wind_bearing/360) - this.dy;

    }
}

class Environment{
    constructor(wind_direction, wind_speed, canvas){
        this.wind_direction = wind_direction;
        this.wind_speed = wind_speed;
        this.canvas = canvas;
        this.boats = [];
        this.previous_time = 0;
        this.delta_time = 0;
        this.animation_toggle = false;
    }

    start_environment(){
        this.animation_toggle = true;
        this.previous_time = performance.now();
        this.render();
        window.requestAnimationFrame(this.draw.bind(this));
    }

    stop_environment(){
        this.animation_toggle = false;
        window.cancelAnimationFrame(this.draw);
    }

    add_boat(boat){
        this.boats.push(boat);
    }

    render() {
        // set canvas proportions to match screen
        this.canvas.canvas.width = document.documentElement.clientWidth;
        this.canvas.canvas.height = document.documentElement.clientHeight;
        let width_change = this.canvas.width /this.canvas.canvas.width;
        let height_change = this.canvas.height/this.canvas.canvas.height;
        this.boats.forEach(
            // adjust bird positions on resize to keep all in frame
            function (node){
                node.x *= width_change;
                node.y *= height_change;
            });
        this.canvas.width = this.canvas.canvas.width;
        this.canvas.height = this.canvas.canvas.height;
    }

    // draw current frame
    draw(current_time){
        let ctx = this.canvas.context;
        // clear canvas ready for new frame
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // get time elapsed since last frame
        this.delta_time = current_time - this.previous_time;
        this.previous_time = current_time;


        //iterate through every bird
        for(let n = 0;n<this.boats.length;n++) {
            let boat = this.boats[n];
            boat.update_position(this.delta_time);
            if(boat.x < boat_length/2.0){
                boat.x = 0;
            }
            if(boat.y < boat_length/2.0){
                boat.y = 0;
            }
            if(boat.x > this.canvas.width - boat_length/2.0){
                boat.x = this.canvas.width;
            }
            if(boat.y > this.canvas.height - boat_length/2.0){
                boat.y = this.canvas.height;
            }

            // points on the boat when pointing in default direction
            let points = structuredClone(boat_points);

            // rotate sail
            let clew = points.clew;
            let mast = points.mast;
            // recenter clew so origin is equivalent to mast location
            clew = [clew[0]-mast[0], clew[1]-mast[1]];
            // rotate sail
            clew = rotate(clew, boat.sail_angle);
            // revert to correct centering
            clew = [clew[0]+mast[0], clew[1]+mast[1]];

            points.clew = clew;

            // rotate tiller and rudder
            let tiller = points.tiller_tip;
            let rudder = points.rudder_tip;
            let stern = points.stern;
            // recenter around stern
            tiller = [tiller[0]-stern[0], tiller[1]-stern[1]];
            rudder = [rudder[0]-stern[0], rudder[1]-stern[1]];
            // rotate tiller
            tiller = rotate(tiller, boat.rudder_angle);
            // rotate rudder
            rudder = rotate(rudder, boat.rudder_angle);
            // revert centering
            tiller = [tiller[0]+stern[0], tiller[1]+stern[1]];
            rudder = [rudder[0]+stern[0], rudder[1]+stern[1]];

            points.tiller_tip = tiller;
            points.rudder_tip = rudder;

            // rotate whole boat to bearing
            for(let key of Object.keys(points)){
                let point = points[key];
                //rotate the given point to align with bearing
                point = rotate(point, boat.bearing-180);

                // add position coordinates to move boat to correct position
                point = [point[0]+boat.x*scale, point[1]+boat.y*scale];

                points[key] = point;

            }

            // set boat colour
            ctx.strokeStyle = gunwale_colour;
            ctx.fillStyle = boat_colour;
            // draw the boat
            ctx.beginPath();
            ctx.moveTo(points.bow[0], points.bow[1]);
            ctx.quadraticCurveTo(points.port_stern[0], points.port_stern[1], points.stern[0], points.stern[1]);
            ctx.quadraticCurveTo(points.starboard_stern[0], points.starboard_stern[1], points.bow[0], points.bow[1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // set tiller colour
            ctx.strokeStyle = tiller_colour;
            ctx.fillStyle = tiller_colour;
            ctx.beginPath();
            ctx.moveTo(points.tiller_tip[0], points.tiller_tip[1]);
            ctx.lineTo(points.rudder_tip[0], points.rudder_tip[1]);
            ctx.closePath();
            ctx.stroke();
            // set sail colour
            ctx.strokeStyle = sail_colour;
            ctx.fillStyle = sail_colour;
            ctx.beginPath();
            ctx.moveTo(points.mast[0], points.mast[1]);
            ctx.lineTo(points.clew[0], points.clew[1]);
            ctx.closePath();
            ctx.stroke();

            // wind indicator
            points = structuredClone(arrow_points);
            for(let key of Object.keys(points)){
                //rotate the given point to align with wind direction and align with top left corner
                points[key] = rotate(points[key], this.wind_direction-180);
                points[key] = [points[key][0] + boat_length, points[key][1]+boat_length];
            }

            // draw direction indicator
            ctx.strokeStyle = "#000000";
            ctx.fillStyle = "#000000";
            ctx.font = "25px Courier New";
            let sog = Math.sqrt(Math.pow(boat.dx, 2) + Math.pow(boat.dy, 2)).toFixed(3);
            let cog = (((Math.atan(boat.dx/boat.dy)*180/Math.PI)%360)+360)%360;
            if(isNaN(cog)){
                cog = 90;
                if(boat.dx === 0){
                    cog = "N/A";
                }
                if(boat.dx < 0){
                    cog = 270;
                }
            }else{
                cog = cog.toFixed(1);
            }
            let stats = `Boat Speed: ${sog}m/s  Bearing: ${boat.bearing.toPrecision(3)}°  COG: ${cog}°`;
            ctx.fillText(stats, 0, this.canvas.height - 25);


            // calculate forces on boat
            boat.update_acceleration(this.wind_direction, this.wind_speed);
        }
        // continue animating unless told otherwise
        if(this.animation_toggle){
            window.requestAnimationFrame(this.draw.bind(this));
        }
    }
}

// object used to keep track of animation canvas
class Canvas{
    #height;
    #width;
    #context;
    constructor(id){
        this.canvas = document.getElementById(id);
        this.#context = this.canvas.getContext("2d");
        this.#height = this.canvas.height;
        this.#width = this.canvas.width;
    }


    set width(value) {
        this.#width = value;
    }

    set height(value) {
        this.#height = value;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    get context() {
        return this.#context;
    }
}

// rotate a point x around the origin by b degrees
function rotate(x, b){
    return [(x[0]*Math.cos(b*Math.PI/180) - x[1]*Math.sin(b*Math.PI/180)),
        (x[1]*Math.cos(b*Math.PI/180) + x[0]*Math.sin(b*Math.PI/180))];
}
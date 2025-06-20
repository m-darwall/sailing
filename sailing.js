arrow_width = 30; // in pixels
arrow_length = 60; // in pixels
boat_colour = "#ffffff"
gunwale_colour  = "#000000"
tiller_colour = "#000000"
sail_colour = "#0000ff"
air_density = 1;
water_density = 1000;
ppm = 9; // pixels per meter
drag_coefficient_bow = 0.04;
drag_coefficient_beam = 2;


arrow_points = {
    "tip": [0, 0.6*arrow_length],
    "tail": [0, 0],
    "left": [-arrow_width*0.5, -0.4*arrow_length],
    "right": [arrow_width*0.5, -0.4*arrow_length]
}


class Boat{
    constructor(x, y, beam, loa, bearing, rudder_area, keel_area, sail_area, mass) {
        this.x = x/ppm; // meters
        this.y = y/ppm; // meters
        this.beam = beam; // (boat width) in meters
        this.loa = loa; // length overall
        this.bearing = (bearing % 360 + 360)%360; // 0 to 360 degrees
        this.sail_angle = 0; // -90 to 90 degrees
        this.main_sheet = 0; // quantity of main sheet let out. Measured as current max degrees from center line for the boom
        this.rudder_angle = 0; // -90 to 90
        this.rudder_area = rudder_area; // meters squared
        this.keel_area = keel_area; // meters squared
        this.sail_area = sail_area; // meters squared
        this.mass = mass; // kilograms
        this.dx = 0; // meters per second
        this.dy = 0; // meters per second
        this.dx2 = 0; // ms^-2
        this.d2y = 0; // ms^-2
        this.rudder_step = 5; // degrees
        this.sail_step = 5; // degrees
        this.debug_text = ""; // for logging values and printing them to screen
        this.apparent_wind_bearing = 0; // degrees
        this.v_rot = 0; // rotational velocity in rad s^-1
        this.dv_rot = 0; // rotational acceleration in rad s^-2
        this.moment_of_inertia = this.mass * Math.pow(this.loa/4, 2); // moment of inertia in kg m^2
        // listens for user controls
        self.addEventListener('keydown', (event) => {
            const key = event.code; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"
            const callback = {
                "KeyA"  : this.leftHandler.bind(this),
                "KeyD" : this.rightHandler.bind(this),
                "KeyI"    : this.inHandler.bind(this),
                "KeyO"  : this.outHandler.bind(this),
            }[key];
            callback?.()
        });
        // points for drawing the boat
        this.boat_points = {
            "bow": [0, 0.5*this.loa],
            "port_stern": [-this.beam * 0.5, 0.5*-this.loa],
            "starboard_stern": [this.beam * 0.5, -this.loa*0.5],
            "mast": [0, this.loa * 0.1],
            "clew": [0, -this.loa*0.286],
            "stern": [0, -this.loa*0.5],
            "tiller_tip": [0, -0.4 * this.loa],
            "rudder_tip": [0, -0.7 * this.loa]
        };

    }

    // updates boat state
    update(delta_time, wind_direction, wind_speed){
        this.update_position_and_velocity(delta_time);
        this.update_rotation(delta_time);
        this.update_sail();
        this.update_acceleration(wind_direction, wind_speed);
    }

    // moves rudder clockwise
    leftHandler(){
        if(this.rudder_angle < 90 - this.rudder_step){
            this.rudder_angle += this.rudder_step;
        }
    }
    // moves rudder anticlockwise
    rightHandler(){
        if(this.rudder_angle > -90 + this.rudder_step){
            this.rudder_angle -= this.rudder_step;
        }
    }

    // pulls in main sheet
    inHandler(){
        this.main_sheet -= this.sail_step;
        if(this.main_sheet < 0){
            this.main_sheet = 0;
        }
        this.update_sail();
    }
    // lets out mainsheet if possible
    outHandler(){
        // this.sail_angle = Math.sign(max_sail_angle)*this.main_sheet;
        this.main_sheet += this.sail_step;
        if(this.main_sheet > 90){
            this.main_sheet = 90;
        }
        this.update_sail();
        if(this.main_sheet > Math.abs(this.sail_angle)){
            this.main_sheet = Math.abs(this.sail_angle);
        }
    }

    update_sail(){
        let max_sail_angle = Math.sign(this.bearing - this.apparent_wind_bearing)*180 - (this.bearing - this.apparent_wind_bearing);
        if(this.apparent_wind_bearing === this.bearing){
            max_sail_angle = 90;
        }
        if (Math.abs(max_sail_angle) > 90){
            max_sail_angle = Math.sign(max_sail_angle)*90;
        }
        if(Math.abs(max_sail_angle) > this.main_sheet){
            max_sail_angle = Math.sign(max_sail_angle)*this.main_sheet;
        }
        this.sail_angle = max_sail_angle;
    }


    // updates boat acceleration due to environmental factors
    update_acceleration(wind_direction, wind_speed){
        this.apparent_wind_bearing = wind_direction;
        let wind_force = this.calculate_wind_force(wind_direction, wind_speed);
        let water_resistance = this.calculate_water_resistance();

        let resultant_x = wind_force[0] + water_resistance[0];
        let resultant_y = wind_force[1] + water_resistance[1];
        this.dx2 = resultant_x / this.mass;
        this.d2y = resultant_y / this.mass;
        this.debug_text += `dx2: ${this.dx2}\n`;
        this.debug_text += `d2y: ${this.d2y}\n`;
        this.debug_text += `acceleration: ${Math.sqrt(Math.pow(this.dx2, 2)+Math.pow(this.d2y, 2))}\n`;
        this.debug_text += `acc bearing: ${toDegrees(Math.atan2(this.dx2, this.d2y))}\n`;
        this.debug_text += `resultant force x: ${resultant_x}\n`;
        this.debug_text += `resultant force y: ${resultant_y}\n`;
    }

    // updates boat position and velocity based on velocity and acceleration
    update_position_and_velocity(delta_time){
        // use x = ut + 0.5at^2 to find new position
        this.x = this.x + this.dx*delta_time/1000 + 0.5*this.dx2*Math.pow(delta_time/1000, 2);
        this.y = this.y + this.dy*delta_time/1000 + 0.5*this.d2y*Math.pow(delta_time/1000, 2);
        // use v = u + at to update velocity
        this.dx = this.dx + this.dx2*delta_time/1000;
        this.dy = this.dy + this.d2y*delta_time/1000;
    }

    // updates boat bearing and rotational velocity based on rotational velocity and rotational acceleration
    update_rotation(delta_time){
        // use x = ut + 0.5at^2 to find new rotation
        this.bearing = ((this.bearing + toDegrees(this.v_rot*delta_time/1000 + 0.5*this.dv_rot*Math.pow(delta_time/1000, 2))) % 360 +360)%360;
        // use v = u + at to update rotational velocity
        this.v_rot = this.v_rot + this.dv_rot*delta_time/1000;

        this.debug_text += `rotational velocity: ${this.v_rot}\n`;
    }

    // calculate the force on the sail exerted by the wind
    calculate_wind_force(wind_bearing, wind_speed){
        // calculate wind components as experienced by the boat
        let wind_x = wind_speed * Math.sin(toRadians(wind_bearing))
        let wind_y = wind_speed * Math.cos(toRadians(wind_bearing))
        let apparent_dx = wind_x - this.dx;
        let apparent_dy = wind_y - this.dy;
        let apparent_wind_speed = Math.sqrt(Math.pow(apparent_dx, 2) + Math.pow(apparent_dy, 2));
        let apparent_wind_bearing = toDegrees(Math.atan2(apparent_dx, apparent_dy));
        // angle from north of sail
        let sail_bearing = ((180 + this.bearing + this.sail_angle)%360 + 360) % 360;
        // angle between wind and sail
        let relative_angle = apparent_wind_bearing - sail_bearing;
        // split into components parallel and perpendicular to the sail
        let v_parallel = apparent_wind_speed*Math.cos(toRadians(relative_angle));
        let v_perpendicular = apparent_wind_speed*Math.sin(toRadians(relative_angle));
        // assume perpendicular wind is stopped by sail
        let result_perpendicular = 0;

        // change in perpendicular velocity
        let delta_v_perpendicular = result_perpendicular - v_perpendicular;

        // multiply delta v by mass of air per second to get force of sail on wind
        let force_perpendicular = delta_v_perpendicular * air_density * apparent_wind_speed * this.sail_area;
        // calculate drag along the sail
        let force_parallel = Math.sign(v_parallel)*0.5*air_density*v_parallel*v_parallel*0.05;

        // calculate resultant force on sail
        // invert force to get force of wind on sail (equal and opposite reaction)
        let fx = -force_perpendicular*Math.sin(toRadians(sail_bearing+90)) + force_parallel*Math.cos(toRadians(sail_bearing+90));
        let fy = -force_perpendicular*Math.cos(toRadians(sail_bearing+90)) + force_parallel*Math.sin(toRadians(sail_bearing+90));

        this.debug_text += `wind fx: ${fx}\n`;
        this.debug_text += `wind fy: ${fy}\n`;
        this.debug_text += `force perpendicular: ${force_perpendicular}\n`;
        this.debug_text += `force parallel: ${force_parallel}\n`;


        return [fx, fy];
    }

    // calculate force on keel exerted by water
    calculate_water_resistance(){
        // calculate water flow components
        let apparent_dx = -this.dx;
        let apparent_dy = -this.dy;
        let apparent_flow_speed = Math.sqrt(Math.pow(apparent_dx, 2) + Math.pow(apparent_dy, 2));
        let apparent_flow_bearing = toDegrees(Math.atan2(apparent_dx, apparent_dy));
        // angle of keel from north inverted to calculate from front to back of boat
        let inverse_keel_bearing = ((this.bearing + 180) % 360 + 360) % 360;
        // angle between flow direction and keel direction
        let relative_angle = apparent_flow_bearing - inverse_keel_bearing;
        // components of flow parallel and perpendicular to keel
        let v_parallel = apparent_flow_speed*Math.cos(toRadians(relative_angle));
        let v_perpendicular = apparent_flow_speed*Math.sin(toRadians(relative_angle));
        // assume perpendicular flow is stopped by the keel
        let result_perpendicular = 0;

        // change in flow perpendicular to keel
        let delta_v_perpendicular = result_perpendicular - v_perpendicular;

        // multiply delta v by mass of water per second to get force of keel on water
        let force_perpendicular = delta_v_perpendicular * water_density * apparent_flow_speed * (this.keel_area + Math.cos(toRadians(this.rudder_angle))*this.rudder_area);
        // calculate drag along the keel
        let force_parallel = Math.sign(v_parallel)*0.5*water_density*v_parallel*v_parallel*drag_coefficient_bow*(0.25 + Math.abs(Math.sin(toRadians(this.rudder_angle)))*this.rudder_area);

        // calculate resultant force on keel
        // invert force to get force of water on keel (equal and opposite reaction)
        let f_x = -force_perpendicular*Math.sin(toRadians(inverse_keel_bearing+90)) + force_parallel*Math.cos(toRadians(inverse_keel_bearing+90));
        let f_y = -force_perpendicular*Math.cos(toRadians(inverse_keel_bearing+90)) + force_parallel*Math.sin(toRadians(inverse_keel_bearing+90));

        return [f_x, f_y];
    }

    // resets debug text
    clear_debug(){
        this.debug_text = "";
    }
}

// environment for adding boats to. Consists of an area with wind blowing. Deals with displaying itself
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
    // start animating the environment
    start_environment(){
        this.animation_toggle = true;
        this.previous_time = performance.now();
        this.render();
        window.requestAnimationFrame(this.draw.bind(this));
    }
    // stop animating the environment
    stop_environment(){
        this.animation_toggle = false;
        window.cancelAnimationFrame(this.draw);
    }
    // toggle environment animation
    toggle(){
        if(this.animation_toggle){
            this.stop_environment();
        }else{
            this.start_environment();
        }
    }
    // add a boat to the environment
    add_boat(boat){
        this.boats.push(boat);
    }

    // adjust canvas and contents based on window size
    render() {
        // set canvas proportions to match screen
        this.canvas.canvas.width = document.documentElement.clientWidth;
        this.canvas.canvas.height = document.documentElement.clientHeight;
        let width_change = this.canvas.canvas.width /this.canvas.width;
        let height_change = this.canvas.canvas.height/this.canvas.height;
        this.canvas.width = this.canvas.canvas.width;
        this.canvas.height = this.canvas.canvas.height;
        this.boats.forEach(
            // adjust boat positions on resize to keep all in frame
            function (node){
                node.x *= width_change;
                node.y *= height_change;
            });

    }

    // draw current frame
    draw(current_time){
        let ctx = this.canvas.context;
        // clear canvas ready for new frame
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // get time elapsed since last frame
        this.delta_time = current_time - this.previous_time;
        this.previous_time = current_time;


        //iterate through every boat
        for(let n = 0;n<this.boats.length;n++) {
            let boat = this.boats[n];
            boat.update(this.delta_time, this.wind_direction, this.wind_speed);
            boat.x = boat.x % (this.canvas.width/ppm - boat.loa*0.5);
            boat.y = boat.y % (this.canvas.height/ppm - boat.loa*0.5);

            // points on the boat when pointing in default direction
            let points = structuredClone(boat.boat_points);

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
            // rotate whole boat to bearing and move to correct position
            for(let key of Object.keys(points)){
                let point = points[key];
                //rotate the given point to align with bearing
                point = rotate(point, boat.bearing-180);

                // add position coordinates to move boat to correct position
                point = [(point[0]+boat.x)*ppm, (point[1]+(this.canvas.height/ppm - boat.y))*ppm];

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

            // boat stats
            ctx.fillStyle = "#000000";
            ctx.font = "25px Courier New";
            let sog = Math.sqrt(Math.pow(boat.dx, 2) + Math.pow(boat.dy, 2)).toFixed(3);
            let cog = (toDegrees(Math.atan2(boat.dx, boat.dy))%360 + 360)%360;
            let stats = `SOG: ${sog}m/s  Bearing: ${boat.bearing.toPrecision(3)}°  COG: ${cog.toFixed(1)}°`;
            ctx.fillText(stats, 0, this.canvas.height - 25);

            // debug text
            ctx.font = "10px Courier New";
            let text = boat.debug_text.split("\n");
            let above = 0
            for(let line of text.keys()){
                ctx.fillText(text[line], 0, above + 500);
                above += 10;
            }
            boat.clear_debug();
        }

        // wind indicator
        let points = structuredClone(arrow_points);
        for(let key of Object.keys(points)){
            //rotate the given point to align with wind direction and align with top left corner
            points[key] = rotate(points[key], this.wind_direction-180);
            points[key] = [points[key][0] + arrow_length, points[key][1]+arrow_length];
        }

        // draw direction indicator
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = "#000000";
        ctx.moveTo(points.tail[0], points.tail[1]);
        ctx.beginPath();
        ctx.lineTo(points.left[0], points.left[1]);
        ctx.lineTo(points.tip[0], points.tip[1]);
        ctx.lineTo(points.right[0], points.right[1]);
        ctx.lineTo(points.tail[0], points.tail[1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // draw speed readout
        ctx.font = "50px Courier New";
        ctx.fillText(`${this.wind_speed}m/s`, 0.2*arrow_length, 2.3*arrow_length);



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
        this.canvas.width = document.documentElement.clientWidth;
        this.canvas.height = document.documentElement.clientHeight;
        this.height = this.canvas.height;
        this.width = this.canvas.width;
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
    return [(x[0]*Math.cos(toRadians(b)) - x[1]*Math.sin(toRadians(b))),
        (x[1]*Math.cos(toRadians(b)) + x[0]*Math.sin(toRadians(b)))];
}

// convert degrees to radians
function toRadians(degrees){
    return degrees*Math.PI/180;
}

// convert radians to degrees
function toDegrees(radians){
    return radians*180/Math.PI;
}
// preset for a sailing dinghy,
// units: meters, kg, m^2, kg m^2
dinghy_preset_1 = {
    // length overall
    "loa": 4.2,
    // width in meters
    "beam": 1.39,
    "mass": 86.4,
    "sail_area": 7.06,
    "sail_edge_area": 0.7,
    "sail_drag_coefficient": 0.0004,
    "boom_mass": 3,
    "keel_area": 0.65,
    "keel_edge_area": 0.01,
    "keel_drag_coefficient": 0.04,
    "rudder_area": 0.1,
    "rudder_edge_area": 0.01,
    "rudder_drag_coefficient": 0.04,
    "moment_of_inertia": 80,
    "boat_points": {
        "bow": [0, 1.8288],
        "port_max": [-0.695*6/4, -0.27],
        "starboard_max": [0.695*6/4, -0.27],
        "port_stern": [-0.5335, -2.3712],
        "starboard_stern": [0.5335, -2.3712],
        "mast": [0, 0.3],
        "keel": [0, 0],
        "clew": [0, -2.4712],
        "main_sheet_block": [0, -2.2712],
        "stern": [0, -2.3712],
        "tiller_tip": [0, -1.35],
        "rudder_tip": [0, -2.5712]
    },
    "boat_colour": "#ffffff",
    "gunwale_colour": "#000000",
    "tiller_colour": "#000000",
    "sail_colour": "#0000ff",
    "sheet_colour": "#ff0000"
}

class Boat{
    /**
     * Boat
     * @param name the name of the boat
     * @param {number}x x position of boat in meters
     * @param {number}y y position of boat in meters
     * @param {number}bearing bearing from North in degrees
     * @param {Object}boat_stats an object with values for the boat's length, beam, mass etc. Example above
     */
    constructor(name, x, y, bearing, boat_stats) {
        // motion
        this.x = x; // meters
        this.y = y; // meters
        this.mass = boat_stats.mass; // kilograms
        this.dx = 0; // meters per second
        this.dy = 0; // meters per second
        this.dx2 = 0; // ms^-2
        this.d2y = 0; // ms^-2
        // rotation
        this.bearing = (bearing % 360 + 360)%360; // 0 to 360 degrees
        this.v_rot = 0; // rotational velocity in rad s^-1
        this.dv_rot = 0; // rotational acceleration in rad s^-2
        this.moment_of_inertia = boat_stats.moment_of_inertia; // moment of inertia in kg m^2
        // sensors
        this.wind_getter = null;
        // sail
        this.sail_angle = 0; // -90 to 90 degrees
        this.main_sheet = 0; // quantity of main sheet let out. Measured as current max degrees from center line for the boom
        this.main_sheet_length = 0;
        this.sail_area = boat_stats.sail_area; // meters squared
        this.sail_step = 5; // degrees
        this.boom_length = distance(boat_stats.boat_points.mast, boat_stats.boat_points.clew);
        this.sail_drag_coefficient = boat_stats.sail_drag_coefficient;
        this.sail_drag_coefficient_pinching = 0.025 + 0.08*(this.boom_length/2*(this.sail_area/this.boom_length));
        this.sail_edge_area = boat_stats.sail_edge_area;

        this.sail_moment_of_inertia = (boat_stats.boom_mass * Math.pow(this.boom_length, 2))/3;
        this.sail_v_rot = 0;
        this.sail_dv_rot = 0;
        this.flapping = false;
        // rudder
        this.rudder_angle = 0; // -90 to 90
        this.rudder_area = boat_stats.rudder_area; // meters squared
        this.rudder_drag_coefficient = boat_stats.rudder_drag_coefficient;
        this.rudder_edge_area = boat_stats.rudder_edge_area;
        this.rudder_step = 3; // degrees
        // keel
        this.keel_area = boat_stats.keel_area; // meters squared
        this.keel_drag_coefficient = boat_stats.keel_drag_coefficient;
        this.keel_edge_area = boat_stats.keel_edge_area;
        // boat dimensions and appearance
        this.name = name;
        this.beam = boat_stats.beam; // (boat width) in meters
        this.loa = boat_stats.loa; // length overall
        this.boat_points = boat_stats.boat_points;
        this.boat_colour = boat_stats.boat_colour;
        this.gunwale_colour  = boat_stats.gunwale_colour;
        this.tiller_colour = boat_stats.tiller_colour;
        this.sail_colour = boat_stats.sail_colour;
        this.sheet_colour = boat_stats.sheet_colour;
        // debugging
        this.debug_text = ""; // for logging values and printing them to screen
    }

    leftHandler(){
        // rotates rudder clockwise
        if(this.rudder_angle < 50 - this.rudder_step){
            this.rudder_angle += this.rudder_step;
        }
    }

    rightHandler(){
        // rotates rudder anti-clockwise
        if(this.rudder_angle > -50 + this.rudder_step){
            this.rudder_angle -= this.rudder_step;
        }
    }

    inHandler(){
        // pulls in main sheet if possible
        this.main_sheet -= this.sail_step;
        if(this.main_sheet < 0){
            this.main_sheet = 0;
        }
        this.update_main_sheet_length();
    }

    outHandler(){
        // lets out mainsheet if possible
        this.main_sheet += this.sail_step;
        if(this.main_sheet > 90){
            this.main_sheet = 90;
        }
        this.update_main_sheet_length();
    }

    update_main_sheet_length(){
        // calculate new length of main sheet,
        // i.e. the distance between the end of the boom and the held end of the sheet if sail is at limit of main sheet
        let held_end = this.boat_points.main_sheet_block;
        let sail_end = this.boat_points.clew;
        sail_end = [sail_end[0] - this.boat_points.mast[0], sail_end[1] - this.boat_points.mast[1]];
        sail_end = rotate(sail_end, this.main_sheet);
        sail_end = [sail_end[0] + this.boat_points.mast[0], sail_end[1] + this.boat_points.mast[1]];
        this.main_sheet_length = distance(sail_end, held_end);
    }

    update(delta_time){
        /** updates boat position, rotation and acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        this.update_position_and_velocity(delta_time);
        this.update_rotation(delta_time);
        this.update_acceleration();
    }

    update_acceleration(){
        // updates boat translational and rotational acceleration due to environmental factors
        let wind_force = this.calculate_wind_force();
        let water_resistance = this.calculate_water_resistance();

        let resultant_x = wind_force[0] + water_resistance[0];
        let resultant_y = wind_force[1] + water_resistance[1];
        let resultant_moment = wind_force[2] + water_resistance[2];
        // F = ma -> a = F/m
        this.dx2 = resultant_x / this.mass;
        this.d2y = resultant_y / this.mass;
        this.dv_rot = resultant_moment / this.moment_of_inertia;
    }


    update_position_and_velocity(delta_time){
        /** updates boat position and velocity based on current velocity and acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        // use v = u + at to update velocity
        this.dx = this.dx + this.dx2*delta_time/1000;
        this.dy = this.dy + this.d2y*delta_time/1000;
        // use x = ut + 0.5at^2 to find new position
        this.x = this.x + this.dx*delta_time/1000 + 0.5*this.dx2*Math.pow(delta_time/1000, 2);
        this.y = this.y + this.dy*delta_time/1000 + 0.5*this.d2y*Math.pow(delta_time/1000, 2);
    }

    update_rotation(delta_time){
        /** updates boat bearing and rotational velocity based on rotational velocity and rotational acceleration
         * @param {Number} delta_time time in milliseconds since last update
         */
        // use v = u + at to update rotational velocity of boat and sail
        this.v_rot = this.v_rot + this.dv_rot*delta_time/1000;
        this.sail_v_rot = this.sail_v_rot + this.sail_dv_rot*delta_time/1000;
        // use x = ut + 0.5at^2 to find new rotation of boat and sail
        let sail_bearing = this.bearing + this.sail_angle;
        this.bearing = ((this.bearing + toDegrees(this.v_rot*delta_time/1000 + 0.5*this.dv_rot*Math.pow(delta_time/1000, 2))) % 360 +360)%360;
        sail_bearing = sail_bearing + toDegrees(this.sail_v_rot*delta_time/1000 + 0.5*this.sail_dv_rot*Math.pow(delta_time/1000, 2));
        this.sail_angle = sail_bearing - this.bearing;
        if(Math.abs(this.sail_angle) >= this.main_sheet){
            this.sail_angle = Math.sign(this.sail_angle)*this.main_sheet;
            this.sail_dv_rot = 0;
            this.sail_v_rot = 0;
        }
    }

    calculate_apparent_wind(point){
        /** calculates apparent wind for a point on the boat
         * @param {Number[2]} point the point relative to the center of rotation when bearing is 0
         * @returns {Number[2]} the x and y components of the apparent wind at the given point
         */
        let radius = Math.sqrt(Math.pow(point[0], 2) + Math.pow(point[1] ,2));
        point = rotate(point, this.bearing);
        // velocity from boat rotation
        let v_from_rotation = this.v_rot * radius;
        let v_from_rotation_x = v_from_rotation*Math.cos(Math.atan2(point[0], point[1]));
        let v_from_rotation_y = v_from_rotation*-Math.sin(Math.atan2(point[0], point[1]));

        let wind = this.wind_getter();

        // apparent velocity of medium in x direction
        let apparent_x = -this.dx + wind[0]*Math.sin(toRadians(wind[1])) + -v_from_rotation_x;
        // apparent velocity of medium in y direction
        let apparent_y = -this.dy + wind[0]*Math.cos(toRadians(wind[1])) + -v_from_rotation_y;
        return [apparent_x, apparent_y];
    }


    calculate_wind_force(){
        // calculate the force and moment on the boat exerted by the sail due to the wind
        let wind = this.wind_getter();
        let wind_x = wind[0] * Math.sin(toRadians(wind[1]));
        let wind_y = wind[0] * Math.cos(toRadians(wind[1]));

        let boom_length = (this.boat_points.clew[1] - this.boat_points.mast[1]);
        let result_sail = this.calculate_lift(1, wind_x, wind_y, this.sail_area, this.sail_edge_area, ((this.bearing + this.sail_angle)% 360 +360)%360, this.boat_points.mast[1], boom_length*0.35, this.sail_drag_coefficient, this.sail_drag_coefficient_pinching);
        let mast = rotate(this.boat_points.mast, this.bearing);
        let moment_round_mast = this.calculate_moment(result_sail[0], result_sail[1], [result_sail[2][0] - mast[0], result_sail[2][1] - mast[1]]);
        // if sail is being pushed against limit of main sheet, all force transfers to the boat
        if(Math.abs(this.sail_angle) === this.main_sheet && (Math.sign(this.sail_angle) === Math.sign(moment_round_mast) || this.sail_angle === 0)){
            return [result_sail[0], result_sail[1], this.calculate_moment(...result_sail)];
        }
        // otherwise the force perpendicular to the sail will rotate the boom instead of affecting the boat
        this.sail_dv_rot = moment_round_mast/this.sail_moment_of_inertia;
        let parallel_component_x = Math.sin(this.sail_angle + this.bearing)*result_sail[0];
        let parallel_component_y = Math.cos(this.sail_angle + this.bearing)*result_sail[1];
        return [parallel_component_x, parallel_component_y, this.calculate_moment(parallel_component_x, parallel_component_y, result_sail[2])];
    }


    calculate_water_resistance(){
        // calculate force on keel exerted by water and moment caused by that force
        let rudder_length = (this.boat_points.stern[1] - this.boat_points.rudder_tip[1]);
        let result_keel = this.calculate_lift(1000, 0, 0, this.keel_area, this.keel_edge_area, this.bearing, this.boat_points.keel[1], 0, this.keel_drag_coefficient, this.keel_drag_coefficient);
        let result_rudder = this.calculate_lift(1000, 0, 0, this.rudder_area, this.keel_edge_area, this.bearing + this.rudder_angle, this.boat_points.stern[1], rudder_length/2, this.rudder_drag_coefficient, this.rudder_drag_coefficient);
        let resultant_x = result_keel[0] + result_rudder[0];
        let resultant_y = result_keel[1] + result_rudder[1];
        let resultant_moment = this.calculate_moment(...result_keel) + this.calculate_moment(...result_rudder);
        return [resultant_x, resultant_y, resultant_moment];
    }


    calculate_lift(medium_density, medium_dx, medium_dy, wing_area, wing_area_leading, wing_bearing, wing_rotation_distance, wing_center_distance, wing_drag_parallel, wing_drag_pinching){
        /** calculates forces on a given wing in a given medium and the point through which those forces act
         * @param {number} medium_density the density of the medium the wing is in (kg m^-3)
         * @param {number} medium_dx the speed in m s^-1 of the medium in the x direction
         * @param {number} medium_dy the speed in m s^-1 of the medium in the y direction
         * @param {number}wing_area the area in m^2 of the wing's 'flat' area
         * @param {number}wing_area_leading the area in m^2 of the wing leading edge
         * @param {number}wing_bearing the direction the front of the wing is pointing, in degrees from north
         * @param {number}wing_rotation_distance the distance from the center of the boat to the point the wing rotates around, in meters
         * @param {number}wing_center_distance the distance in meters between the point the wing rotates around and the point on the wing where the force acts
         * @param {number}wing_drag_parallel the drag coefficient of the wing parallel to the direction of the wing
         * @param {number}wing_drag_pinching the drag coefficient of the wing parallel to the direction of the wing when flow is too close to wing angle
         * @returns {number[3]} An array of three numbers: [The force in the x direction(N), the force in the y direction(N), the moment clockwise(Nm)]
         **/


        // x of point force acts through relative to boat center of rotation if boat is pointing north
        let x = Math.sin(toRadians(wing_bearing-this.bearing))*wing_center_distance;
        // y of point force acts through relative to boat center of rotation if boat is pointing north
        let y = wing_rotation_distance + Math.cos(toRadians(wing_bearing - this.bearing))*wing_center_distance;
        // distance from center of rotation of point force acts through
        let radius = Math.sqrt(Math.pow(x, 2) + Math.pow(y ,2));
        // location of point relative to boat with boat at actual bearing
        let point = rotate([x, y], this.bearing);

        // velocity perpendicular to wing from boat rotation
        let v_from_rotation = this.v_rot * radius;
        let v_from_rotation_x = v_from_rotation*Math.cos(Math.atan2(point[0], point[1]));
        let v_from_rotation_y = v_from_rotation*-Math.sin(Math.atan2(point[0], point[1]));

        // apparent velocity of medium in x direction
        let apparent_x = -this.dx + medium_dx + -v_from_rotation_x;
        // apparent velocity of medium in y direction
        let apparent_y = -this.dy + medium_dy + -v_from_rotation_y;
        let apparent_magnitude = Math.sqrt(Math.pow(apparent_x, 2) + Math.pow(apparent_y, 2));
        let apparent_bearing = toDegrees(Math.atan2(apparent_x, apparent_y));
        let relative_bearing = apparent_bearing - wing_bearing;
        let angle_to_flow = ((relative_bearing % 360 + 360)%360) - 180;

        // apparent medium velocity parallel to wing
        let apparent_parallel = Math.cos(toRadians(relative_bearing))*apparent_magnitude;
        // apparent medium flow perpendicular to wing
        let apparent_perpendicular = Math.sin(toRadians(relative_bearing))*apparent_magnitude;

        // parallel drag force
        // drag along wing, using F_d = 0.5 * medium density * flow velocity ^ 2 * drag coefficient * reference area
        let drag_coefficient = wing_drag_parallel;
        // if sailing too close to the wind increase drag and flap sail
        if(Math.abs(angle_to_flow) < 10 && wing_drag_parallel !== wing_drag_pinching){
            drag_coefficient = wing_drag_pinching;
            this.flapping = true;
        }else if (wing_drag_parallel !== wing_drag_pinching){
            this.flapping = false;
        }
        let drag_parallel = Math.sign(apparent_parallel) * 0.5 * medium_density * Math.pow(apparent_parallel, 2) * drag_coefficient * wing_area_leading;
        // perpendicular drag force, F = m(v - u)/t. Or, F =  mass per second * (v-u)
        // change in velocity(v - u) of medium perpendicular to wing, assume wing stops flow entirely
        let delta_v_perpendicular = 0 - apparent_perpendicular;
        // mass of medium hitting wing per second = (volume per second) * (mass per volume) = (flow rate * surface area) * (medium density)
        let mass_per_second = Math.abs(apparent_perpendicular) * wing_area * medium_density;
        // force of wing on medium
        let force_perpendicular = mass_per_second * delta_v_perpendicular;
        // invert to get force of medium on wing
        force_perpendicular = -force_perpendicular;

        // resultant translational force in x direction
        let resultant_x = drag_parallel*Math.sin(toRadians(wing_bearing)) + force_perpendicular*Math.cos(toRadians(wing_bearing));
        // resultant translational force in y direction
        let resultant_y = drag_parallel*Math.cos(toRadians(wing_bearing)) - force_perpendicular*Math.sin(toRadians(wing_bearing));

        return [resultant_x, resultant_y, point];
    }

    calculate_moment(force_x, force_y, point){
        /**
         * calculate the moment due to a force at a point relative to the center of rotation
         * @param force_x{number} the x component of the force
         * @param force_y{number} the y component of the force
         * @param point{number[2]} the point relative to the center of rotation
         */
        let moment_from_x = force_x * point[1];
        let moment_from_y = force_y * -point[0];
        return moment_from_x + moment_from_y;
    }

    clear_debug(){
        // resets debug text
        this.debug_text = "";
    }
}

class Buoy{
    constructor(x, y,radius, colour) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.colour = colour;
    }

    draw_self(context, ppm, origin){
        /**
         * draws itself at the correct location
         * @param context the context being used to draw to canvas
         * @param ppm the scale of the drawing in pixels per meter
         * @param origin the in-world x and y coordinate of the point at the top left of the canvas
         */
        context.fillStyle = this.colour;
        context.strokeStyle = this.colour;
        context.beginPath();
        context.arc((this.x - origin[0])*ppm, (origin[1] - this.y)*ppm, this.radius*ppm, 0, Math.PI*2);
        context.fill();
        context.stroke();
    }

    check_collisions(objects){
        let collisions = [];
        for(let i=0;i<objects.length; i++){
            let object = objects[i];
            if(distance([this.x, this.y], [object.x, object.y]) <= object.loa/ 2){
                collisions.push(object);
            }
        }
        return collisions;
    }
}

class Timer{
    /**
     * A timer that can be drawn on screen for keeping track of time and displaying it to user
     * @param start the initial time on the timer in seconds
     * @param duration the time the timer should last in seconds
     * @param direction whether the timer should count up or down, 1 for up, -1 for down
     * @param position{number[]} the x and y position, in pixels of the bottom left corner of the timer reading
     * @param font the style of the timer text
     * @param max_width the maximum width of the timer reading in pixels
     * @param colour the colour of the timer reading
     * @param warning_threshold the time remaining, in seconds, past which the timer should change colour to indicate limited time
     * @param warning_colour the colour to which the readout should change past the warning threshold
     */
    constructor(start, duration, direction, position, font, max_width, colour, warning_threshold, warning_colour) {
        this.duration = duration*1000;
        this.initial_time = start*1000;
        this.time = start*1000;
        this.text = `${Math.floor(0.001*this.initial_time/60)}:${(this.initial_time%60000)/1000}:${this.initial_time%1000}`;
        this.text = this.time_to_text(this.initial_time);
        this.direction = direction
        this.position = position;
        this.font = font;
        this.max_width = max_width;
        this.warning_threshold = warning_threshold*1000;
        this.running=false;
        this.colour = colour;
        this.warning_colour = warning_colour;
    }

    start(){
        this.running=true;
        this.start_time = Date.now();
        this.end_time = this.start_time + this.duration;
    }
    stop(){
        this.running = false;
        this.duration = this.end_time - Date.now();
        this.initial_time = this.time;
    }
    update(context){
        if(this.running){
            if(Date.now() < this.end_time){
                let time_since_start = Date.now() - this.start_time;
                this.time = this.initial_time + this.direction*time_since_start;
                this.text = this.time_to_text(this.time);
                this.draw(context);
                return true;
            }else{
                this.time = this.initial_time + this.duration*this.direction;
                this.text = this.time_to_text(this.time);
                this.draw(context);
                return false
            }
        }
        this.draw(context);
        return true;
    }
    time_to_text(time){
        let text = "";
        if(Math.sign(time) < 0){
            text += "-"
        }
        let minutes = Math.floor(Math.abs(time)/60000).toString().padStart(2, "0");
        let seconds = Math.floor((Math.abs(time)%60000)/1000).toString().padStart(2, "0");
        let milliseconds = Math.abs(time%1000).toString().padStart(3, "0");
        text += `${minutes}:${seconds}:${milliseconds}`;

        return text;
    }
    draw(context){
        context.fillStyle = this.colour;
        context.font = this.font;
        let remaining_time = this.end_time - Date.now();
        if(remaining_time < this.warning_threshold){
            context.fillStyle = this.warning_colour;
        }
        context.fillText(this.text, this.position[0], this.position[1], this.max_width);
    }

    add_time(seconds){
        this.duration += seconds*1000;
        this.end_time += seconds*1000;
        this.initial_time -= this.direction*seconds*1000;
    }
}


class Environment{
    /**
     * environment for adding boats to. Consists of an area with wind blowing. Deals with displaying itself
     * @param wind_direction bearing of the wind
     * @param wind_speed speed of wind in that direction
     * @param canvas an HTML canvas to display on
     * @param pixels_per_meter the scale of the displayed environment in pixels per meter
     */
    constructor(wind_direction, wind_speed, canvas, pixels_per_meter){
        this.game_mode = "sandbox";
        this.scores = {}
        this.wind_direction = wind_direction;
        this.wind_speed = wind_speed;
        this.canvas = canvas;
        this.boats = [];
        this.captains = [];
        this.buoys = [];
        this.timers = [];
        this.previous_time = 0;
        this.delta_time = 0;
        this.animation_toggle = false;
        this.ppm = pixels_per_meter;
        // wind indicator
        this.arrow_width = 30; // in pixels
        this.arrow_length = 60; // in pixels
        this.arrow_points = {
            "tip": [0, 0.6*this.arrow_length],
            "tail": [0, 0],
            "left": [-this.arrow_width*0.5, -0.4*this.arrow_length],
            "right": [this.arrow_width*0.5, -0.4*this.arrow_length]
        }
    }

    start_environment(){
        // start animating the environment
        this.animation_toggle = true;
        this.previous_time = performance.now();
        this.render();
        window.requestAnimationFrame(this.draw.bind(this));
        for(let n = 0;n<this.captains.length;n++) {
            this.captains[n].wake();
        }
        for(let n = 0;n<this.timers.length;n++) {
            this.timers[n].start();
        }
    }

    stop_environment(){
        // stop animating the environment
        this.animation_toggle = false;
        window.cancelAnimationFrame(this.draw);
        for(let n = 0;n<this.captains.length;n++) {
            this.captains[n].sleep();
        }
        for(let n = 0;n<this.timers.length;n++) {
            this.timers[n].stop();
        }

    }

    toggle(){
        // toggle environment animation
        if(this.animation_toggle){
            this.stop_environment();
        }else{
            this.start_environment();
        }

    }

    add_boat(boat){
        /** adds the given boat to the environment
          * @param {Boat} boat a boat object
         **/
        boat.wind_getter = this.get_wind.bind(this);
        this.boats.push(boat);
        this.scores[boat.name] = 0;
    }

    add_captain(captain){
        this.captains.push(captain);
    }

    add_buoy(buoy){
        this.buoys.push(buoy);
    }

    get_wind(){
        /**
         * @returns {Number[2]} wind speed in m s^-1 and wid direction as a bearing in degrees
         */
        return [this.wind_speed, this.wind_direction];
    }

    start_snake(){
        if(this.boats.length !== 0){
            this.game_mode = "snake";
            this.reset(this.boats);
            this.buoys = [];
            this.wind_direction = Math.random()*360;
            let buoy = new Buoy(Math.random()*this.canvas.width/this.ppm, Math.random()*this.canvas.height/this.ppm, 0.5, "purple");
            this.add_buoy(buoy);
            this.snake_timer = new Timer(60, 60, -1, [this.arrow_length*2, 50], "50px Courier New", this.canvas.width/4, "black", 10, "red");
            this.snake_timer.start();
            this.timers.push(this.snake_timer);
        }
    }

    reset(boats){
        for(let n = 0;n<boats.length;n++) {
            let boat = boats[n];
            this.scores[boat.name] = 0;
            boat.x = 0.5*this.canvas.width/this.ppm
            boat.y = 0.5*this.canvas.height/this.ppm
            boat.dx = 0;
            boat.dy = 0;
            boat.dx2 = 0;
            boat.dy2 = 0;
            boat.bearing = Math.random()*360;

        }
    }


    render() {
        // adjust canvas and contents based on window size
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
        this.buoys.forEach(
            // adjust boat positions on resize to keep all in frame
            function (node){
                node.x *= width_change;
                node.y *= height_change;
            });
    }


    draw(current_time){
        /** draws a new frame of animation
         * @param {number} current_time the current unix timestamp
         */
        let ctx = this.canvas.context;
        // clear canvas ready for new frame
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        // get time elapsed since last frame
        this.delta_time = current_time - this.previous_time;
        this.previous_time = current_time;
        //iterate through every boat
        for(let n = 0;n<this.buoys.length;n++) {
            let buoy = this.buoys[n];
            buoy.draw_self(ctx, this.ppm, [0, this.canvas.height/this.ppm]);
            let collisions = buoy.check_collisions(this.boats);
            if(this.game_mode === "snake"){
                if(collisions.length !== 0){
                    this.buoys[n] = null;
                    this.add_buoy(new Buoy(Math.random()*this.canvas.width/this.ppm, Math.random()*this.canvas.height/this.ppm, 0.5, "purple"));
                    this.snake_timer.add_time(30);
                }
                for (const obj of collisions) {
                    if (this.scores.hasOwnProperty(obj.name)) {
                        this.scores[obj.name] += 1;
                    }
                }
            }
        }
        this.buoys = this.buoys.filter(n => n);


        //iterate through every boat
        for(let n = 0;n<this.boats.length;n++) {
            let boat = this.boats[n];
            boat.update(this.delta_time, this.wind_direction, this.wind_speed);
            if(this.game_mode === "snake"){
                if(boat.x < 0 || boat.x > this.canvas.width/this.ppm || boat.y < 0 || boat.y > this.canvas.height/this.ppm){
                    this.reset([boat]);
                }
            }
            boat.x = ((boat.x % (this.canvas.width/this.ppm)) + (this.canvas.width/this.ppm))%(this.canvas.width/this.ppm);
            boat.y = ((boat.y % (this.canvas.height/this.ppm)) + (this.canvas.height/this.ppm))%(this.canvas.height/this.ppm);

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
                point = rotate(point, boat.bearing);

                // add position coordinates to move boat to correct position
                let point_in_space = [point[0] + boat.x, point[1]+boat.y];

                // convert to canvas location
                points[key] = [point_in_space[0]*this.ppm, (this.canvas.height/this.ppm - point_in_space[1])*this.ppm];
            }
            // set boat colour
            ctx.strokeStyle = boat.gunwale_colour;
            ctx.fillStyle = boat.boat_colour;
            // draw the boat
            ctx.beginPath();
            ctx.moveTo(points.bow[0], points.bow[1]);
            ctx.quadraticCurveTo(points.port_max[0], points.port_max[1], points.port_stern[0], points.port_stern[1]);
            ctx.lineTo(points.starboard_stern[0], points.starboard_stern[1]);
            ctx.quadraticCurveTo(points.starboard_max[0], points.starboard_max[1], points.bow[0], points.bow[1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // set tiller colour
            ctx.strokeStyle = boat.tiller_colour;
            ctx.fillStyle = boat.tiller_colour;
            ctx.beginPath();
            ctx.moveTo(points.tiller_tip[0], points.tiller_tip[1]);
            ctx.lineTo(points.rudder_tip[0], points.rudder_tip[1]);
            ctx.closePath();
            ctx.stroke();
            // set sail colour
            ctx.strokeStyle = boat.sail_colour;
            ctx.fillStyle = boat.sail_colour;
            ctx.moveTo(points.mast[0], points.mast[1]);
            if(boat.flapping){
                let random_point = random_point_near_line(points.mast, points.clew, 3);
                let random_point1 = random_point_near_line(points.mast, points.clew, 3);
                ctx.bezierCurveTo(...random_point,...random_point1, points.clew[0], points.clew[1]);
            }else{
                ctx.lineTo(points.clew[0], points.clew[1]);
            }
            ctx.stroke();
            // draw main sheet
            ctx.strokeStyle = boat.sheet_colour;
            ctx.beginPath();
            ctx.moveTo(points.main_sheet_block[0], points.main_sheet_block[1]);
            let slack = boat.main_sheet_length - distance(points.clew, points.main_sheet_block)/this.ppm;
            if(slack < 0.1){
                ctx.lineTo(points.clew[0], points.clew[1]);
            } else {
                let random_point = random_point_near_line(points.main_sheet_block, points.clew, slack);
                let random_point1 = random_point_near_line(points.main_sheet_block, points.clew, slack);
                ctx.bezierCurveTo(...random_point,...random_point1, points.clew[0], points.clew[1]);
            }
            ctx.stroke();
            // boat stats
            ctx.fillStyle = "#000000";
            ctx.font = "25px Courier New";
            let sog = Math.sqrt(Math.pow(boat.dx, 2) + Math.pow(boat.dy, 2)).toFixed(3);
            let cog = (toDegrees(Math.atan2(boat.dx, boat.dy))%360 + 360)%360;
            let stats = `SOG: ${sog}m/s  Bearing: ${boat.bearing.toPrecision(3)}°  COG: ${cog.toFixed(1)}°`;

            ctx.fillText(stats, 0, this.canvas.height - 25);

            // draw score
            if(this.game_mode === "snake"){
                ctx.font = "50px Courier New";
                ctx.fillText(`${boat.name}: ${this.scores[boat.name]}`, 2*this.arrow_length,  100 + n*50);
            }

            // debug text
            ctx.font = "10px Courier New";
            let text = boat.debug_text.split("\n");
            let above = 0
            for(let line of text.keys()){
                ctx.fillText(text[line], 0, above + 400);
                above += 10;
            }
            boat.clear_debug();
        }

        // wind indicator
        let points = structuredClone(this.arrow_points);
        for(let key of Object.keys(points)){
            //rotate the given point to align with wind direction and align with top left corner
            points[key] = rotate(points[key], this.wind_direction);
            points[key] = [points[key][0] + this.arrow_length, (this.arrow_length - points[key][1])];
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
        ctx.font = "40px Courier New";
        ctx.fillText(`${this.wind_speed}m/s`, 0.2*this.arrow_length, 2.3*this.arrow_length, this.arrow_length*1.6);

        if(this.game_mode === "snake"){
            if(this.snake_timer.update(ctx) === false){
                ctx.font = "100px Courier New";
                ctx.fillStyle = "red";
                ctx.fillText("YOU LOSE! (Press Space to try again)", 0, this.canvas.height/2, this.canvas.width);
                this.stop_environment();
                this.reset(this.boats);
                this.start_snake();
            }
        }

        // continue animating unless told otherwise
        if(this.animation_toggle){
            window.requestAnimationFrame(this.draw.bind(this));
        }
    }
}

class Agent{
    constructor(boat, awake) {
        this.boat = boat;
        this.awake = awake;
    }
    wake(){
        this.awake = true;
    }
    sleep(){
        this.awake = false;
    }
}

class UserAgent extends Agent{
    constructor(boat, awake, port, starboard, pull, let_out) {
        super(boat, awake);
        // user control listener
        window.addEventListener('keydown', (event) => {
            const key = event.code; // "ArrowRight", "ArrowLeft", "ArrowUp", or "ArrowDown"
            const callback = {
                [port]  : this.boat.leftHandler.bind(this.boat),
                [starboard] : this.boat.rightHandler.bind(this.boat),
                [pull]    : this.boat.inHandler.bind(this.boat),
                [let_out]  : this.boat.outHandler.bind(this.boat),
            }[key];
            if(this.awake){
                callback?.()
            }

        });
    }
}


class Canvas{
    // object used to keep track of animation canvas
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

function rotate(x, b){
    /** rotates point x around the origin by b degrees
     * @param {Number[2]}x a point with an x and y coordinate
     * @param {Number}b a number of degrees clockwise to rotate x by
     * @returns {Number[2]} a point [x, y]
     */
    return [(x[0]*Math.cos(toRadians(b)) + x[1]*Math.sin(toRadians(b))),
        (x[1]*Math.cos(toRadians(b)) - x[0]*Math.sin(toRadians(b)))];
}


function toRadians(degrees){
    // convert degrees to radians
    return degrees*Math.PI/180;
}


function toDegrees(radians){
    // convert radians to degrees
    return radians*180/Math.PI;
}

function distance(point1, point2){
    /**
     * gives the distance between point1 and point2
     * @param {Number[2]}point1 a point [x, y]
     * @param {Number[2]}point2 a point [x, y]
     * @returns {Number} a distance in the same unit as the coordinates
     */
    return Math.sqrt(Math.pow(point1[0]-point2[0], 2) + Math.pow(point1[1]-point2[1], 2));
}

function random_point_near_line(point1, point2, max){
    /**
     * returns a random point within max distance of the line between point1 and point2
     * @param point1{Number[2]} a point[x,y]
     * @param point2{Number[2]} a point[x,y]
     * @param max{Number} the distance from the line which the point must not exceed
     * @returns {Number[2]} a point within max of the line between point 1 and 2
     */
    let x = Math.min(point1[0], point2[0]) + Math.random()*Math.abs(point2[0] - point1[0]);
    let y = Math.min(point1[1], point2[1]) + Math.random()*Math.abs(point2[1] - point1[1]);
    let delta_x = (2*Math.random() - 1)*max;
    let delta_y = (2*Math.random() - 1)*(Math.pow(max, 2) - Math.pow(delta_x, 2));
    if(Math.random() < 0.5){
        return [x + delta_x, y + delta_y];
    }
    return [x + delta_y, y + delta_x];
}